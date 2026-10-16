/**
 * Integration tests for POST /api/vote endpoint.
 *
 * Coverage gaps (mock fetch limitation):
 * - Real GitHub comment posting (mocked)
 * - GitHub API validation of comment content
 * - Real reaction emoji validation
 */

import { describe, it, expect, beforeAll, afterEach, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { fetchMock } from './fetchMock.js';
import { SELF } from './testWorker.js';
import {
  applySchema,
  cleanDB,
  makeCsrf,
  createTestSession,
  insertTestRepo,
  insertTestPR,
} from './helpers.js';

describe('POST /api/vote', () => {
  let postedCommentBody: Promise<string> | null = null;
  beforeAll(async () => {
    await applySchema(env);
  });

  beforeEach(() => {
    postedCommentBody = null;
    fetchMock.activate();
    fetchMock.disableNetConnect();

    // Mock GitHub comment POST
    fetchMock
      .when((req) => {
        if (!req.url.includes('/issues') || !req.url.includes('/comments')) return false;
        postedCommentBody = req.clone().text();
        return true;
      })
      .respondWith(
        new Response(
          JSON.stringify({
            id: 123456789,
            body: 'Mocked OASIS comment',
            user: { login: 'validator-bot' },
          }),
          {
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      );
  });

  afterEach(async () => {
    fetchMock.deactivate();
    await cleanDB(env);
  });

  async function vote(
    prId: number,
    decision: string,
    csrf: string,
    sessionCookie: string,
    tokenCookie: string,
    extraFields?: Record<string, unknown>,
    cookieCsrf = csrf,
  ) {
    return await SELF.fetch(
      new Request('http://localhost/api/vote', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrf,
          Cookie: `__csrf=${cookieCsrf}; ${sessionCookie}; ${tokenCookie}`,
        },
        body: JSON.stringify({
          pr_id: prId,
          decision,
          confidence: 'High',
          summary: 'Test validation summary',
          ...extraFields,
        }),
      }),
    );
  }

  describe('authentication & CSRF', () => {
    it('requires authenticated session', async () => {
      const csrf = makeCsrf();
      const res = await SELF.fetch(
        new Request('http://localhost/api/vote', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-csrf-token': csrf,
            Cookie: `__csrf=${csrf}`,
          },
          body: JSON.stringify({ pr_id: 1, decision: 'accept' }),
        }),
      );

      expect(res.status).toBe(401);
    });

    it('requires valid CSRF token', async () => {
      const { sessionCookie, tokenCookie } = await createTestSession(env);
      const csrf = makeCsrf();
      const wrongCsrf = makeCsrf();

      await insertTestPR(env);

      const res = await vote(1001, 'accept', wrongCsrf, sessionCookie, tokenCookie, undefined, csrf);
      expect(res.status).toBe(403);
    });
  });

  describe('vote submission', () => {
    it('accepts valid accept vote', async () => {
      const { sessionCookie, tokenCookie } = await createTestSession(env);
      const csrf = makeCsrf();

      await insertTestPR(env);

      const res = await vote(1001, 'accept', csrf, sessionCookie, tokenCookie, {
        confidence: 'High',
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
    });

    it('stores optional assessment answers and includes them in the GitHub validation comment', async () => {
      const { sessionCookie, tokenCookie, login } = await createTestSession(env);
      const csrf = makeCsrf();
      await insertTestPR(env);

      const res = await vote(1001, 'accept', csrf, sessionCookie, tokenCookie, {
        vulnerability_assessment: 'hardening',
        introduced_vulnerability: 'no',
        security_issue_addressed: 'needs_modification',
        breaks_codebase: null,
      });

      expect(res.status).toBe(200);
      const stored = await env.DB.prepare(`SELECT decision, vulnerability_assessment, introduced_vulnerability,
        security_issue_addressed, breaks_codebase FROM user_votes WHERE github_login = ? AND pr_id = ?`)
        .bind(login, 1001).first<Record<string, string | null>>();
      expect(stored).toMatchObject({
        decision: 'accept', vulnerability_assessment: 'hardening', introduced_vulnerability: 'no',
        security_issue_addressed: 'needs_modification', breaks_codebase: null,
      });
      const requestBody = JSON.parse((await postedCommentBody) ?? '{}') as { body: string };
      expect(requestBody.body).toContain('| Decision | Accept |');
      expect(requestBody.body).toContain('| Vulnerability assessment | Hardening |');
      expect(requestBody.body).toContain('| Introduces new vulnerability | No |');
      expect(requestBody.body).toContain('| Addresses the security issue | Needs modification |');
      expect(requestBody.body).not.toContain('Breaks the codebase');
    });

    it('leaves unanswered assessment questions NULL', async () => {
      const { sessionCookie, tokenCookie, login } = await createTestSession(env);
      const csrf = makeCsrf();
      await insertTestPR(env);
      expect((await vote(1001, 'accept', csrf, sessionCookie, tokenCookie)).status).toBe(200);
      const stored = await env.DB.prepare(`SELECT vulnerability_assessment, introduced_vulnerability,
        security_issue_addressed, breaks_codebase FROM user_votes WHERE github_login = ? AND pr_id = ?`)
        .bind(login, 1001).first<Record<string, string | null>>();
      expect(stored).toEqual({ vulnerability_assessment: null, introduced_vulnerability: null, security_issue_addressed: null, breaks_codebase: null });
    });

    it('accepts modify vote with required fields', async () => {
      const { sessionCookie, tokenCookie } = await createTestSession(env);
      const csrf = makeCsrf();

      await insertTestPR(env);

      const res = await vote(1001, 'modify', csrf, sessionCookie, tokenCookie, {
        confidence: 'Medium',
        next_step_selection: 'security-review',
      });

      expect(res.status).toBe(200);
    });

    it('accepts reject vote with an independent security issue assessment', async () => {
      const { sessionCookie, tokenCookie, login } = await createTestSession(env);
      const csrf = makeCsrf();

      await insertTestPR(env);

      const res = await vote(1001, 'reject', csrf, sessionCookie, tokenCookie, {
        summary: 'Not suitable',
        vulnerability_assessment: 'yes',
        security_issue_addressed: 'no',
      });

      expect(res.status).toBe(200);
      const stored = await env.DB.prepare('SELECT vulnerability_assessment, security_issue_addressed FROM user_votes WHERE github_login = ? AND pr_id = ?')
        .bind(login, 1001).first<Record<string, string | null>>();
      expect(stored).toEqual({ vulnerability_assessment: 'yes', security_issue_addressed: 'no' });
    });

    it('accepts duplicate vote with parent PR', async () => {
      const { sessionCookie, tokenCookie } = await createTestSession(env);
      const csrf = makeCsrf();

      await insertTestPR(env, { id: 1001 });
      await insertTestPR(env, { id: 1002, number: 2 });

      const res = await vote(1002, 'duplicate', csrf, sessionCookie, tokenCookie, {
        parent_pr_number: 1,
      });

      expect(res.status).toBe(200);
    });

    it('records optional Team attribution for a current Team member', async () => {
      const { sessionCookie, tokenCookie, login } = await createTestSession(env);
      const csrf = makeCsrf();
      const timestamp = new Date().toISOString();
      await env.DB.prepare(`INSERT INTO teams (name, description, membership_mode, status, owner_login, created_at, updated_at)
        VALUES (?, '', 'invite_only', 'active', ?, ?, ?)`)
        .bind('Vote attribution', login, timestamp, timestamp).run();
      const team = await env.DB.prepare(`SELECT id FROM teams WHERE name = ?`).bind('Vote attribution').first<{ id: number }>();
      await env.DB.prepare(`INSERT INTO team_memberships (team_id, github_login, role, joined_at) VALUES (?, ?, 'owner', ?)`)
        .bind(team?.id, login, timestamp).run();
      await insertTestPR(env);

      const res = await vote(1001, 'accept', csrf, sessionCookie, tokenCookie, { team_id: team?.id });
      expect(res.status).toBe(200);
      const stored = await env.DB.prepare('SELECT team_id FROM user_votes WHERE github_login = ? AND pr_id = ?')
        .bind(login, 1001).first<{ team_id: number }>();
      expect(stored?.team_id).toBe(team?.id);
    });
  });

  describe('validation', () => {
    it.each([
      ['vulnerability_assessment', 'maybe'],
      ['introduced_vulnerability', 'hardening'],
      ['security_issue_addressed', 'unknown'],
      ['breaks_codebase', 'not_sure'],
    ])('rejects unsupported assessment answer %s', async (field, value) => {
      const { sessionCookie, tokenCookie } = await createTestSession(env);
      const csrf = makeCsrf();
      await insertTestPR(env);
      const res = await vote(1001, 'accept', csrf, sessionCookie, tokenCookie, { [field]: value });
      expect(res.status).toBe(400);
    });

    it('rejects vote on closed PR', async () => {
      const { sessionCookie, tokenCookie } = await createTestSession(env);
      const csrf = makeCsrf();

      await insertTestPR(env, { state: 'closed' });

      const res = await vote(1001, 'accept', csrf, sessionCookie, tokenCookie);

      expect(res.status).toBe(409);
    });

    it('rejects duplicate vote on same PR', async () => {
      const { sessionCookie, tokenCookie, login } = await createTestSession(env);
      const csrf1 = makeCsrf();
      const csrf2 = makeCsrf();

      await insertTestPR(env);

      // First vote
      const res1 = await vote(1001, 'accept', csrf1, sessionCookie, tokenCookie);
      expect(res1.status).toBe(200);

      // Second vote (duplicate)
      const res2 = await vote(1001, 'modify', csrf2, sessionCookie, tokenCookie, {
        confidence: 'Medium',
        next_step_selection: 'security-review',
      });

      expect(res2.status).toBe(409);
    });

    it('rejects invalid decision value', async () => {
      const { sessionCookie, tokenCookie } = await createTestSession(env);
      const csrf = makeCsrf();

      await insertTestPR(env);

      const res = await vote(1001, 'invalid-decision', csrf, sessionCookie, tokenCookie);

      expect(res.status).toBe(400);
    });

    it('rejects vote for non-existent PR', async () => {
      const { sessionCookie, tokenCookie } = await createTestSession(env);
      const csrf = makeCsrf();

      const res = await vote(99999, 'accept', csrf, sessionCookie, tokenCookie);

      expect(res.status).toBe(404);
    });
  });

  describe('database updates', () => {
    it('creates user_votes row', async () => {
      const { sessionCookie, tokenCookie, login } = await createTestSession(env);
      const csrf = makeCsrf();

      await insertTestPR(env);

      const res = await vote(1001, 'accept', csrf, sessionCookie, tokenCookie);
      expect(res.status).toBe(200);

      // Verify vote was recorded
      const votes = await env.DB.prepare('SELECT * FROM user_votes WHERE github_login = ?')
        .bind(login)
        .all();

      expect(votes.results).toHaveLength(1);
      expect((votes.results[0] as any).decision).toBe('accept');
    });

    it('updates pull_requests consensus_accept count', async () => {
      const { sessionCookie, tokenCookie } = await createTestSession(env);
      const csrf = makeCsrf();

      await insertTestPR(env);

      await vote(1001, 'accept', csrf, sessionCookie, tokenCookie);

      // Check PR consensus
      const pr = await env.DB.prepare('SELECT consensus_accept FROM pull_requests WHERE id = ?')
        .bind(1001)
        .first();

      expect((pr as any).consensus_accept).toBe(1);
    });

    it('updates pr_participants table', async () => {
      const { sessionCookie, tokenCookie, login } = await createTestSession(env);
      const csrf = makeCsrf();

      await insertTestPR(env);

      await vote(1001, 'accept', csrf, sessionCookie, tokenCookie);

      // Check participant entry
      const participant = await env.DB.prepare(
        'SELECT * FROM pr_participants WHERE pr_id = ? AND login = ?',
      )
        .bind(1001, login)
        .first();

      expect(participant).toBeDefined();
      expect((participant as any).decision).toBe('accept');
    });
  });

  describe('rate limiting', () => {
    it('allows 5 votes per 60 seconds', async () => {
      const { sessionCookie, tokenCookie } = await createTestSession(env);

      // Create 5 PRs
      for (let i = 0; i < 5; i++) {
        await insertTestPR(env, { id: 1001 + i, number: i + 1 });
      }

      // Vote on all 5
      for (let i = 0; i < 5; i++) {
        const csrf = makeCsrf();
        const res = await vote(1001 + i, 'accept', csrf, sessionCookie, tokenCookie);
        expect(res.status).toBe(200);
      }
    });

    it('rejects 6th vote with 429', async () => {
      const { sessionCookie, tokenCookie } = await createTestSession(env);

      // Create 6 PRs
      for (let i = 0; i < 6; i++) {
        await insertTestPR(env, { id: 1001 + i, number: i + 1 });
      }

      // Vote on first 5
      for (let i = 0; i < 5; i++) {
        const csrf = makeCsrf();
        await vote(1001 + i, 'accept', csrf, sessionCookie, tokenCookie);
      }

      // 6th vote should fail
      const csrf = makeCsrf();
      const res = await vote(1006, 'accept', csrf, sessionCookie, tokenCookie);

      expect(res.status).toBe(429);
    });
  });
});
