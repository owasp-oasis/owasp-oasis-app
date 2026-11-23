import { beforeAll, beforeEach, afterEach, describe, expect, it } from 'vitest';
import { env } from 'cloudflare:test';
import { applySchema, cleanDB, insertTestPR, insertTestRepo } from './helpers';
import { fetchMock } from './fetchMock';
import { SELF } from './testWorker';
import { runSyncOneRepo } from '../../../worker/sync';
import { upsertPR } from '../../../worker/db';

const pr = { id:1001, number:1, title:'Fix CWE-502 (Unsafe Deserialization)', body:'## What we found\n- **Severity:** Medium', state:'open', html_url:'https://example.test/pull/1', created_at:'2026-01-01T00:00:00Z', updated_at:'2026-01-02T00:00:00Z' };
describe('severity metadata through sync and Workspace', () => {
  beforeAll(() => applySchema(env));
  beforeEach(() => {fetchMock.activate();fetchMock.disableNetConnect();});
  afterEach(async () => {fetchMock.deactivate();await cleanDB(env);});
  it('persists body severity on new PRs and serves it through the queue and live detail endpoint', async () => {
    await insertTestRepo(env, {id:101,name:'severity-demo'});
    await upsertPR(env.DB, pr, 101, 'severity-demo', 0,0,0,0,0,0,0,0,null,'2026-11-23T00:00:00Z');
    fetchMock.when(r=>r.url.includes('/pulls/1')).respondWith(Response.json(pr));
    const details = await (await SELF.fetch(new Request('http://localhost/api/pr-panel/1001/details'))).json() as {cvss_severity:string};
    const fixes = await (await SELF.fetch(new Request('http://localhost/api/workspace/prs'))).json() as {severity:string}[];
    expect(details.cvss_severity).toBe('medium'); expect(fixes[0].severity).toBe('medium');
  });
  it('backfills older unedited PRs without rewriting votes or requesting comments', async () => {
    await insertTestRepo(env,{id:101,name:'severity-demo'});
    await insertTestPR(env,{id:1001,repo_id:101,repo_name:'severity-demo'});
    await insertTestPR(env,{id:1002,repo_id:101,repo_name:'severity-demo',number:2});
    await env.DB.prepare('UPDATE pull_requests SET consensus_accept = 4 WHERE id = 1001').run();
    await env.DB.prepare("UPDATE repos SET synced_at = '2026-11-01T00:00:00Z' WHERE id = 101").run();
    fetchMock.when(r=>r.url.includes('/orgs/owasp-oasis/repos?')).respondWith(Response.json([{id:101,name:'severity-demo',full_name:'owasp-oasis/severity-demo',language:'Java',fork:true,stargazers_count:0}]));
    fetchMock.when(r=>r.url==='https://api.github.com/repos/owasp-oasis/severity-demo').respondWith(Response.json({}));
    fetchMock.when(r=>r.url.includes('/pulls?state=open')).respondWith(Response.json([pr,{...pr,id:1002,number:2}]));
    fetchMock.when(r=>r.url.includes('/pulls?state=closed')).respondWith(Response.json([]));
    expect((await runSyncOneRepo(env,{deferFinalization:true})).ok).toBe(true);
    const stored = await env.DB.prepare('SELECT severity, consensus_accept FROM pull_requests WHERE id = 1001').first();
    expect(stored).toMatchObject({severity:'medium',consensus_accept:4});
    expect((await runSyncOneRepo(env,{deferFinalization:true})).ok).toBe(true);
    expect(await env.DB.prepare('SELECT severity FROM pull_requests WHERE id = 1002').first()).toMatchObject({severity:'medium'});
    await env.DB.prepare("UPDATE repos SET synced_at = '2026-11-01T00:00:00Z' WHERE id = 101").run();
    await env.DB.prepare("DELETE FROM sync_state WHERE key = 'sync_cursor'").run();
    expect((await runSyncOneRepo(env,{deferFinalization:true})).stats.prs).toBe(0);
  });
});
