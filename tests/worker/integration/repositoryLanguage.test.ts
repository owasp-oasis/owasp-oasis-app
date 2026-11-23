import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { env } from 'cloudflare:test';
import { runSyncOneRepo } from '../../../worker/sync.js';
import { applySchema, cleanDB, insertTestPR, insertTestRepo } from './helpers.js';
import { fetchMock } from './fetchMock.js';
import { SELF } from './testWorker.js';

const repo = { id: 701, name: 'sample-java', full_name: 'owasp-oasis/sample-java', description: 'Synthetic Java project', language: null, fork: true, stargazers_count: 0 };
function mockRepo(language: string | null = null, detailLanguage: string | null = null) {
  fetchMock.when(r => r.url.includes('/orgs/owasp-oasis/repos?')).respondWith(Response.json([{ ...repo, language }]));
  fetchMock.when(r => r.url === 'https://api.github.com/repos/owasp-oasis/sample-java').respondWith(Response.json({ language: detailLanguage }));
  fetchMock.when(r => r.url.includes('/sample-java/pulls?')).respondWith(Response.json([]));
}
function mockLanguages(data: Record<string, number>, status = 200) {
  fetchMock.when(r => r.url === 'https://api.github.com/repos/owasp-oasis/sample-java/languages').respondWith(Response.json(data, { status }));
}
async function sync() {
  expect((await runSyncOneRepo(env, { deferFinalization: true })).ok).toBe(true);
  return (await env.DB.prepare('SELECT language FROM repos WHERE id = 701').first<{ language: string | null }>())?.language;
}

describe('repository language synchronization', () => {
  beforeAll(() => applySchema(env));
  beforeEach(() => { fetchMock.activate(); fetchMock.disableNetConnect(); });
  afterEach(async () => { fetchMock.deactivate(); await cleanDB(env); });

  it('backfills a null language using the largest language by byte count and exposes it to Workspace', async () => {
    await insertTestRepo(env, { ...repo });
    mockRepo();
    mockLanguages({ JavaScript: 900, Java: 12000, HTML: 300 });
    expect(await sync()).toBe('Java');
    await insertTestPR(env, { id: 702, repo_id: repo.id, repo_name: repo.name });
    const projects = await (await SELF.fetch(new Request('http://localhost/api/workspace/repos'))).json() as { language: string }[];
    const fixes = await (await SELF.fetch(new Request('http://localhost/api/workspace/prs'))).json() as { language: string }[];
    expect(projects[0].language).toBe('Java');
    expect(fixes[0].language).toBe('Java');
  });

  it('uses the primary language without a language statistics request', async () => {
    mockRepo('Python');
    expect(await sync()).toBe('Python');
  });
  it('uses repository detail language when the listing is null', async () => {
    mockRepo(null, 'Java');
    expect(await sync()).toBe('Java');
  });
  it('keeps unknown repositories unknown when no statistics exist', async () => {
    mockRepo(); mockLanguages({});
    expect(await sync()).toBeNull();
  });
  it('preserves the previous language when GitHub temporarily has no statistics', async () => {
    await insertTestRepo(env, { ...repo, language: 'Java' });
    mockRepo(); mockLanguages({});
    expect(await sync()).toBe('Java');
  });
  it('continues synchronization and preserves known language if statistics fail', async () => {
    await insertTestRepo(env, { ...repo, language: 'Java' });
    mockRepo(); mockLanguages({}, 403);
    expect(await sync()).toBe('Java');
  });
  it('leaves a new repository unknown when statistics fail', async () => {
    mockRepo(); mockLanguages({}, 403);
    expect(await sync()).toBeNull();
  });
});
