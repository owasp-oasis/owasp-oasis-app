import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { env } from 'cloudflare:test';
import { SELF } from './testWorker.js';
import { applySchema, cleanDB, insertTestPR, insertTestRepo } from './helpers.js';
import { handleDashboard, handleRegistrationCount } from '../../../worker/handlers/dashboard.js';
import type { DashboardData } from '../../../worker/dashboardTypes.js';
import type { Env } from '../../../worker/types.js';

const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
async function dashboard(range = '90') {
  const response = await SELF.fetch(new Request(`http://localhost/api/dashboard?range=${range}`));
  expect(response.status).toBe(200);
  return await response.json() as DashboardData;
}
async function vote(pr: number, login: string, date: string, decision = 'accept') {
  await env.DB.prepare('INSERT INTO user_votes (github_login, pr_id, repo_name, pr_number, decision, voted_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(login, pr, 'test-repo', pr, decision, date + 'T12:00:00Z').run();
}

describe('public dashboard', () => {
  beforeAll(() => applySchema(env));
  beforeEach(() => cleanDB(env));

  it('returns real zeros and a current calendar window for an empty database', async () => {
    const data = await dashboard();
    expect(Object.values(data.totals).every(value => value === 0)).toBe(true);
    expect(data.trend.points).toHaveLength(12);
    expect(data.trend.points.every(point => point.count === 0)).toBe(true);
    expect(data.trend.from).toBe(day(-89));
    expect(data.trend.to).toBe(day(0));
    expect(data.activity.days).toHaveLength(84);
    expect(data.activity.days[0].date).toBe(day(-83));
    expect(data.activity.days.at(-1)?.date).toBe(day(0));
    expect(data.last_synced_at).toBeNull();
    expect(data.recent_fixes).toEqual([]);
  });

  it('reports all registrations even without any fixes or reviewers', async () => {
    await env.DB.prepare(`WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<907)
      INSERT INTO registrations (name, email, ip_hash, created_at)
      SELECT 'Synthetic registration', 'synthetic-' || x || '@example.test', 'test', '2026-01-01T00:00:00Z' FROM n`).run();
    const data = await dashboard();
    expect(data.totals.registrations).toBe(907);
    expect(data.totals.active_reviewers_90d).toBe(0);
    expect(data.totals.candidates).toBe(0);
    const count = await SELF.fetch(new Request('http://localhost/api/count'));
    expect(await count.json()).toEqual({ ok: true, count: 907 });
    expect(JSON.stringify(data)).not.toMatch(/Synthetic registration|example.test|ip_hash|github_login|avatar_url/);
  });

  it('aggregates beyond the Workspace 500-row limit and excludes removed inventory', async () => {
    await insertTestRepo(env, { id: 1 });
    await env.DB.prepare(`WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<505)
      INSERT INTO pull_requests (id,repo_id,repo_name,number,title,state,created_at,updated_at)
      SELECT x,1,'test-repo',x,'Synthetic candidate','open',?,? FROM n`)
      .bind(day(-10),day(0)).run();
    await insertTestRepo(env, { id: 3, name: 'empty-active-project' });
    await insertTestRepo(env, { id: 2, name: 'inactive-project' });
    await insertTestPR(env, { id: 9000, number: 9000, repo_id: 2, repo_name: 'inactive-project' });
    await env.DB.prepare('UPDATE repos SET active=0 WHERE id=2').run();
    await insertTestPR(env, { id: 9001, number: 9001 });
    await env.DB.prepare('UPDATE pull_requests SET deleted=1 WHERE id=9001').run();
    await vote(9000, 'excluded-reviewer', day(0));
    await vote(9001, 'excluded-reviewer', day(0));
    const data = await dashboard();
    expect(data.totals.candidates).toBe(505);
    expect(data.totals.projects).toBe(2);
    expect(data.projects).toHaveLength(2);
    expect(data.projects[0].candidates).toBe(505);
    expect(data.projects[1]).toMatchObject({ name: 'empty-active-project', candidates: 0 });
    expect(data.trend.points.at(-1)?.count).toBe(505);
    expect(data.totals.votes).toBe(2);
    expect(data.totals.active_reviewers_90d).toBe(1);
    expect(data.activity.days.at(-1)?.votes).toBe(2);
    expect(data.recent_fixes).toHaveLength(10);
  });

  it('partitions statuses and counts recorded reviewer votes separately from comment consensus', async () => {
    for (let id = 1; id <= 5; id++) await insertTestPR(env, { id, number: id });
    await env.DB.prepare("UPDATE pull_requests SET participants=10,consensus_accept=8,consensus_modify=2 WHERE id=2").run();
    await env.DB.prepare("UPDATE pull_requests SET state='closed',merged_upstream=1 WHERE id=3").run();
    await env.DB.prepare("UPDATE pull_requests SET state='closed',consensus_accept=2 WHERE id=4").run();
    // A merge flag alone does not override the Workspace requirement for a closed fix.
    await env.DB.prepare('UPDATE pull_requests SET merged_upstream=1 WHERE id=5').run();
    for (const [i, decision] of ['accept','modify','reject','duplicate'].entries()) await vote(i+1,'synthetic-reviewer',day(-2),decision);
    const data = await dashboard();
    expect(data.totals).toMatchObject({candidates:5,needs_review:2,trusted:1,accepted:1,closed:1,votes:4,accept:1,modify:1,reject:1,duplicate:1,active_reviewers_90d:1});
    expect(data.projects[0]).toMatchObject({candidates:5,needs_review:2,trusted:1,accepted:1,closed:1});
  });

  it('uses vote timestamps, not PR updates, and counts distinct reviewers within 90 UTC days', async () => {
    for (let id = 1; id <= 4; id++) await insertTestPR(env, { id, number: id });
    await vote(1,'recent-reviewer',day(-10));
    await vote(2,'recent-reviewer',day(-10),'modify');
    await vote(3,'boundary-reviewer',day(-89),'reject');
    await vote(4,'old-reviewer',day(-90));
    const data = await dashboard();
    expect(data.totals.active_reviewers_90d).toBe(2);
    expect(data.totals.votes).toBe(4);
    expect(JSON.stringify(data)).not.toMatch(/recent-reviewer|boundary-reviewer|old-reviewer|github_login/);
    expect(data.activity.days.find(row=>row.date===day(-10))?.votes).toBe(2);
    expect(data.activity.days.at(-1)?.votes).toBe(0);
    expect(data.activity.days.reduce((sum,row)=>sum+row.votes,0)).toBe(2);
  });

  it('ends creation charts today even when all activity is old and handles all-time', async () => {
    await insertTestPR(env);
    await env.DB.prepare('UPDATE pull_requests SET created_at=?,updated_at=?').bind(day(-150),day(-100)).run();
    const recent = await dashboard('30');
    expect(recent.trend.from).toBe(day(-29));
    expect(recent.trend.to).toBe(day(0));
    expect(recent.trend.points.at(-1)?.count).toBe(0);
    const all = await dashboard('all');
    expect(all.trend.from).toBe(day(-150));
    expect(all.trend.to).toBe(day(0));
    expect(all.trend.points.at(-1)?.count).toBe(1);
    expect(all.trend.points.every((point,i,points)=>!i||point.count>=points[i-1].count)).toBe(true);
  });

  it('reports sync freshness separately from the time of the database query', async () => {
    const synced = day(-2) + 'T00:00:00Z';
    await env.DB.prepare("INSERT OR REPLACE INTO sync_state (key,value) VALUES ('last_synced_at',?),('sync_running','1')").bind(synced).run();
    const data = await dashboard();
    expect(data.last_synced_at).toBe(synced);
    expect(data.sync_running).toBe(true);
    expect(data.generated_at.slice(0,10)).toBe(day(0));
  });

  it('bounds the query inputs and marks failures unavailable instead of returning zeros', async () => {
    expect((await SELF.fetch(new Request('http://localhost/api/dashboard?range=999999'))).status).toBe(400);
    const broken = { ...env, DB: undefined } as unknown as Env;
    for (const handler of [handleDashboard, handleRegistrationCount]) {
      const response = await handler(broken,new Request('http://localhost/api/dashboard'));
      expect(response.status).toBe(503);
      const body = await response.json() as Record<string,unknown>;
      expect(body.ok).toBe(false);
      expect(body).not.toHaveProperty('count');
      expect(body).not.toHaveProperty('totals');
    }
  });
});
