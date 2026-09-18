import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { env } from 'cloudflare:test';
import { upsertPR } from '../../../worker/db.js';
import { getResponseBadgeSummary } from '../../../worker/responseBadges.js';
import { SELF } from './testWorker.js';
import { applySchema, cleanDB, insertTestPR, insertTestRepo } from './helpers.js';

describe('response badge integration', () => {
  beforeAll(async () => applySchema(env));
  beforeEach(async () => cleanDB(env));

  async function insertRequestAndVote(options: {
    prId: number;
    login: string;
    requestedAt: string;
    votedAt: string;
    author?: string;
    badgeEligible?: number;
    status?: 'open' | 'responded' | 'closed' | 'cancelled';
    commentId?: number;
  }): Promise<void> {
    const repoName = `badge-repo-${options.prId}`;
    const repoId = 50_000 + options.prId;
    await insertTestRepo(env, { id: repoId, name: repoName });
    await insertTestPR(env, {
      id: options.prId,
      repo_id: repoId,
      repo_name: repoName,
      number: options.prId,
    });
    await env.DB.prepare('UPDATE pull_requests SET author = ? WHERE id = ?')
      .bind(options.author ?? 'different-author', options.prId).run();
    await env.DB.prepare(`
      INSERT INTO validation_requests
        (pr_id, requested_at, request_source, status, badge_eligible, created_at, updated_at)
      VALUES (?, ?, 'workspace_sync', ?, ?, ?, ?)
    `).bind(
      options.prId,
      options.requestedAt,
      options.status ?? 'responded',
      options.badgeEligible ?? 1,
      options.requestedAt,
      options.votedAt,
    ).run();
    await env.DB.prepare(`
      INSERT INTO user_votes
        (github_login, pr_id, repo_name, pr_number, decision, comment_id, voted_at)
      VALUES (?, ?, ?, ?, 'accept', ?, ?)
    `).bind(
      options.login,
      options.prId,
      repoName,
      options.prId,
      options.commentId ?? 90_000 + options.prId,
      options.votedAt,
    ).run();
  }

  async function syncPR(prId: number, repoId: number, repoName: string, syncStart: string): Promise<void> {
    await upsertPR(env.DB, {
      id: prId,
      number: 1,
      title: 'New security fix',
      state: 'open',
      html_url: `https://github.com/owasp-oasis/${repoName}/pull/1`,
      created_at: '2026-09-11T11:00:00.000Z',
      updated_at: syncStart,
      user: { login: 'fix-author' },
    }, repoId, repoName, 0, 0, 0, 0, 0, 0, 0, 0, null, syncStart);
  }

  it('starts an eligible clock for a newly discovered open PR', async () => {
    await insertTestRepo(env, { id: 7001, name: 'new-request-repo' });
    const syncStart = '2026-09-12T12:00:00.000Z';

    await syncPR(8001, 7001, 'new-request-repo', syncStart);

    const request = await env.DB.prepare(`
      SELECT requested_at, request_source, status, badge_eligible
      FROM validation_requests WHERE pr_id = ?
    `).bind(8001).first();

    expect(request).toEqual({
      requested_at: syncStart,
      request_source: 'workspace_sync',
      status: 'open',
      badge_eligible: 1,
    });
  });

  it('does not reopen a responded request during a later sync', async () => {
    await insertTestRepo(env, { id: 7002, name: 'resync-repo' });
    await syncPR(8002, 7002, 'resync-repo', '2026-09-12T12:00:00.000Z');
    await env.DB.prepare("UPDATE validation_requests SET status = 'responded' WHERE pr_id = 8002").run();

    await syncPR(8002, 7002, 'resync-repo', '2026-09-12T18:00:00.000Z');

    const request = await env.DB.prepare(
      'SELECT requested_at, status, badge_eligible FROM validation_requests WHERE pr_id = 8002',
    ).first();
    expect(request).toEqual({
      requested_at: '2026-09-12T12:00:00.000Z',
      status: 'responded',
      badge_eligible: 1,
    });
  });

  it('marks a previously known PR without a clock as observation-only', async () => {
    await insertTestRepo(env, { id: 7003, name: 'historical-repo' });
    await insertTestPR(env, {
      id: 8003,
      repo_id: 7003,
      repo_name: 'historical-repo',
      number: 1,
    });

    await syncPR(8003, 7003, 'historical-repo', '2026-09-12T12:00:00.000Z');

    const request = await env.DB.prepare(
      'SELECT request_source, badge_eligible FROM validation_requests WHERE pr_id = 8003',
    ).first();
    expect(request).toEqual({ request_source: 'workspace_sync', badge_eligible: 0 });
  });

  it('earns Fast Responder at ten responses and the 80 percent boundary', async () => {
    const now = new Date('2026-09-12T12:00:00.000Z');
    for (let index = 0; index < 10; index++) {
      const requestedAt = new Date(now.getTime() - (index + 1) * 86_400_000);
      const responseHours = index < 8 ? 24 : 30;
      await insertRequestAndVote({
        prId: 1000 + index,
        login: 'fast-validator',
        requestedAt: requestedAt.toISOString(),
        votedAt: new Date(requestedAt.getTime() + responseHours * 3_600_000).toISOString(),
      });
    }

    const summary = await getResponseBadgeSummary(env.DB, 'fast-validator', now);

    expect(summary.metrics).toMatchObject({
      totalResponses: 10,
      firstResponses: 10,
      responses90d: 10,
      fastResponses90d: 8,
      fastRate90d: 0.8,
    });
    expect(summary.badges.find(badge => badge.id === 'fast_responder')?.state).toBe('active');
  });

  it('earns Coverage Contributor at five first responses after 72 hours', async () => {
    const now = new Date('2026-09-12T12:00:00.000Z');
    for (let index = 0; index < 5; index++) {
      const requestedAt = new Date(now.getTime() - (index + 5) * 86_400_000);
      await insertRequestAndVote({
        prId: 2000 + index,
        login: 'coverage-validator',
        requestedAt: requestedAt.toISOString(),
        votedAt: new Date(requestedAt.getTime() + 72 * 3_600_000).toISOString(),
      });
    }

    const summary = await getResponseBadgeSummary(env.DB, 'coverage-validator', now);

    expect(summary.metrics.coverageResponses180d).toBe(5);
    expect(summary.badges.find(badge => badge.id === 'coverage_contributor')?.state).toBe('active');
  });

  it('uses the stable comment id to break equal timestamp ties', async () => {
    const requestedAt = '2026-09-12T10:00:00.000Z';
    const votedAt = '2026-09-12T11:00:00.000Z';
    await insertRequestAndVote({ prId: 3001, login: 'later-id', requestedAt, votedAt, commentId: 20 });
    await env.DB.prepare(`
      INSERT INTO user_votes
        (github_login, pr_id, repo_name, pr_number, decision, comment_id, voted_at)
      VALUES ('earlier-id', 3001, 'badge-repo-3001', 3001, 'accept', 10, ?)
    `).bind(votedAt).run();

    const winner = await getResponseBadgeSummary(env.DB, 'earlier-id', new Date('2026-09-12T12:00:00.000Z'));
    const runnerUp = await getResponseBadgeSummary(env.DB, 'later-id', new Date('2026-09-12T12:00:00.000Z'));

    expect(winner.metrics.firstResponses).toBe(1);
    expect(runnerUp.metrics.firstResponses).toBe(0);
  });

  it('excludes PR authors, cancelled clocks, observation-only clocks, and early votes', async () => {
    await insertRequestAndVote({
      prId: 4001,
      login: 'excluded-validator',
      author: 'excluded-validator',
      requestedAt: '2026-09-10T10:00:00.000Z',
      votedAt: '2026-09-10T11:00:00.000Z',
    });
    await insertRequestAndVote({
      prId: 4002,
      login: 'excluded-validator',
      requestedAt: '2026-09-10T10:00:00.000Z',
      votedAt: '2026-09-10T11:00:00.000Z',
      badgeEligible: 0,
    });
    await insertRequestAndVote({
      prId: 4003,
      login: 'excluded-validator',
      requestedAt: '2026-09-10T10:00:00.000Z',
      votedAt: '2026-09-10T11:00:00.000Z',
      status: 'cancelled',
    });
    await insertRequestAndVote({
      prId: 4004,
      login: 'excluded-validator',
      requestedAt: '2026-09-10T10:00:00.000Z',
      votedAt: '2026-09-10T09:59:59.000Z',
    });

    const summary = await getResponseBadgeSummary(
      env.DB,
      'excluded-validator',
      new Date('2026-09-12T12:00:00.000Z'),
    );
    expect(summary.metrics.totalResponses).toBe(0);
  });

  it('adds badges to the profile response without changing reputation fields', async () => {
    await env.DB.prepare(`
      INSERT INTO contributors (login, base_reputation, modified_reputation)
      VALUES ('profile-validator', 42, 84)
    `).run();
    await insertRequestAndVote({
      prId: 5001,
      login: 'profile-validator',
      requestedAt: '2026-09-12T10:00:00.000Z',
      votedAt: '2026-09-12T11:00:00.000Z',
    });

    const response = await SELF.fetch(new Request('http://localhost/api/contributors/profile-validator'));
    const body = await response.json<any>();

    expect(response.status).toBe(200);
    expect(body.contributor).toMatchObject({ base_reputation: 42, modified_reputation: 84 });
    expect(body.responseBadges.badges).toHaveLength(3);
    expect(body.responseBadges.badges[0]).toMatchObject({ id: 'first_responder', state: 'active' });
  });

  it('keeps the profile endpoint available before the badge migration lands', async () => {
    await env.DB.prepare(`
      INSERT INTO contributors (login, base_reputation, modified_reputation)
      VALUES ('migration-lag-user', 12, 24)
    `).run();
    await env.DB.prepare('DROP TABLE validation_requests').run();

    try {
      const response = await SELF.fetch(new Request('http://localhost/api/contributors/migration-lag-user'));
      const body = await response.json<any>();

      expect(response.status).toBe(200);
      expect(body.responseBadges.badges.every((badge: any) => badge.state === 'locked')).toBe(true);
      expect(body.contributor).toMatchObject({ base_reputation: 12, modified_reputation: 24 });
    } finally {
      await applySchema(env);
    }
  });
});
