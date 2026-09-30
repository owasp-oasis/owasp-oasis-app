// Local UX review harness: real Worker handlers + isolated D1, synthetic identities.
// Never imported by the application or deployed. All outbound Worker requests are blocked.
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { createServer } from 'node:http'
import { readFile, readdir } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import { dirname, extname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const port = Number(process.env.TEAMS_PREVIEW_PORT || 4175)
const runtime = new Miniflare(convertV4MiniflareOptions({
  modules: [{ type: 'ESModule', path: resolve(root, 'dist-worker/index.js') }, ...(await readdir(resolve(root, 'dist-worker'), { recursive: true })).filter(name => name.endsWith('.js') && name !== 'index.js').map(name => ({ type: 'ESModule', path: resolve(root, 'dist-worker', name) }))],
  modulesRoot: resolve(root, 'dist-worker'),
  compatibilityDate: '2026-06-10', // Available local workerd; production config stays unchanged.
  d1Databases: ['DB'], kvNamespaces: ['RATE_KV'],
  bindings: { ENVIRONMENT: 'development' },
  outboundService: () => new Response('External requests are disabled in this local preview.', { status: 503 }),
}))
const db = await runtime.getD1Database('DB')
const schema = (await readFile(resolve(root, 'schema.sql'), 'utf8')).replace(/--[^\n]*/g, '')
for (const statement of schema.split(';').map(value => value.trim()).filter(Boolean)) await db.prepare(statement).run()
const now = new Date().toISOString()
const expires = new Date(Date.now() + 7 * 86400000).toISOString()
const identities = ['demo-owner', 'demo-admin', 'demo-member', 'demo-newcomer']
const sessions = {}
for (const login of identities) {
  sessions[login] = randomBytes(32).toString('hex')
  await db.prepare('INSERT INTO user_sessions (session_id, github_login, avatar_url, created_at, expires_at) VALUES (?, ?, ?, ?, ?)')
    .bind(sessions[login], login, '/__demo/avatar.svg', now, expires).run()
}
// Keep the persona switcher useful for workflow walkthroughs: maintainer
// controls are admin-authorized, while the other personas remain members.
for (const [id, login] of [[9001, 'demo-owner'], [9002, 'demo-admin']]) {
  await db.prepare(`INSERT INTO user_roles
    (github_user_id, github_login, role, assigned_by_github_user_id, created_at, updated_at)
    VALUES (?, ?, 'admin', ?, ?, ?)`)
    .bind(id, login, id, now, now).run()
}
await db.prepare("INSERT INTO teams (id, name, description, membership_mode, owner_login, created_at, updated_at) VALUES (1, 'Python security reviewers', 'Small reviews. Safer Python projects. Join us in validating security fixes across the ecosystem.', 'request', 'demo-owner', ?, ?)")
  .bind(now, now).run()
await db.prepare("INSERT INTO teams (id, name, description, membership_mode, owner_login, created_at, updated_at) VALUES (2, 'Web application defenders', 'A community working together on authentication and safer web applications.', 'request', 'demo-admin', ?, ?)")
  .bind(now, now).run()
await db.prepare("INSERT INTO teams (id, name, description, membership_mode, owner_login, created_at, updated_at) VALUES (3, 'Open source maintainers', 'A welcoming place for OASIS members who want to review fixes together.', 'request', 'demo-admin', ?, ?)")
  .bind(now, now).run()
for (const [team, login, role] of [[1, 'demo-owner', 'owner'], [1, 'demo-admin', 'admin'], [1, 'demo-member', 'member'], [2, 'demo-admin', 'owner']]) {
  await db.prepare('INSERT INTO team_memberships (team_id, github_login, role, joined_at) VALUES (?, ?, ?, ?)').bind(team, login, role, now).run()
}
// This snapshot is taken from OASIS's own Workspace API. It keeps the local
// preview deterministic while using the same repositories and validation PRs
// reviewers see in the deployed workspace.
const snapshot = JSON.parse(await readFile(resolve(root, 'scripts/oasis-preview-snapshot.json'), 'utf8'))
const previewRepos = snapshot.repos
for (const repo of previewRepos) {
  await db.prepare('INSERT INTO repos (id, name, full_name, description, language, upstream_url, open_prs, stars, synced_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(repo.id, repo.name, repo.full_name, repo.description, repo.language, repo.upstream_url, repo.open_prs, repo.stars ?? 0, repo.synced_at ?? now).run()
}
for (const repo of previewRepos) {
  await db.prepare("INSERT INTO team_repositories (team_id, repo_id, added_by, created_at) VALUES (1, ?, 'demo-owner', ?)").bind(repo.id, now).run()
}
await db.prepare("INSERT INTO team_join_requests (team_id, requester_login, created_at) VALUES (1, 'demo-newcomer', ?)").bind(now).run()
await db.prepare("INSERT INTO team_invites (team_id, invitee_login, invited_by, created_at) VALUES (2, 'demo-owner', 'demo-admin', ?)").bind(now).run()
const candidateFixes = snapshot.prs.map(pr => [
  pr.id, pr.repo_id, pr.repo_name, pr.number, pr.title, pr.state, pr.participants ?? 0,
  pr.consensus_accept ?? 0, pr.consensus_modify ?? 0, pr.consensus_reject ?? 0,
  pr.consensus_duplicate ?? 0, pr.author, pr.html_url, pr.comment_count ?? 0,
  pr.oasis_comment_count ?? 0, pr.non_oasis_comment_count ?? 0, pr.merged_upstream ?? 0,
  pr.merged_at ?? null, pr.created_at ?? now, pr.updated_at ?? now, pr.detection_tool ?? null, pr.head_sha ?? null,
])
const repoByName = new Map(previewRepos.map(repo => [repo.name, repo]))
for (const [id, repoId, repoName, number, title, state, participants, accepts, modifies, rejects, duplicates, author, htmlUrl, commentCount, oasisCommentCount, nonOasisCommentCount, mergedUpstream, mergedAt, createdAt, updatedAt, detectionTool, headSha] of candidateFixes) {
  await db.prepare(`INSERT INTO pull_requests
    (id, repo_id, repo_name, number, title, state, author, html_url, comment_count, oasis_comment_count, non_oasis_comment_count, participants,
     consensus_accept, consensus_modify, consensus_reject, consensus_duplicate, merged_upstream, merged_at, head_sha, created_at, updated_at, synced_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, repoId, repoName, number, title, state, author, htmlUrl, commentCount, oasisCommentCount, nonOasisCommentCount, participants, accepts, modifies, rejects, duplicates, mergedUpstream, mergedAt, headSha, createdAt, updatedAt, now).run()
}
for (const [index, login] of identities.entries()) {
  await db.prepare(`INSERT INTO contributors
    (login, avatar_url, prs_worked, total_interactions, accepts, modifies, rejects, comment_score,
     peer_score, reaction_score, trust_score, base_reputation, modified_reputation, rank_90d, synced_at)
    VALUES (?, '/__demo/avatar.svg', ?, ?, ?, 1, 0, ?, 1.05, .5, 10, ?, ?, ?, ?)`)
    .bind(login, 4 - index, 12 - index, 3 - Math.min(index, 2), 6 - index, 17.55 - index, 21.06 - index, index + 1, now).run()
}

const types = { '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon' }
const allowedAPI = /^\/api\/(teams(?:\/|$)|csrf$|auth\/(me|logout)$|preferences\/(mine|workspace)$|workspace\/(meta|repos|prs|contributors|maintainers|tools)$|sync\/status(?:\/|$)|contributors\/[^/]+$|votes\/mine$|pr-panel\/\d+\/(details|files|comments|react|workflow)$)/
const mockContributor = {
  login: 'demo-member', avatar_url: '/__demo/avatar.svg', prs_worked: 1,
  total_interactions: 4, non_oasis_interactions: 0, reactions_received: 3,
  reactions_given: 2, accepts: 1, modifies: 0, rejects: 0,
  comment_score: 4, peer_score: 1.05, reaction_score: 0.5, trust_score: 10,
  base_reputation: 15.55, modified_reputation: 18.66, rank_90d: 1,
  rank_90d_oldest_activity: null, synced_at: now,
}
const mockPublicBadges = [{
  team_id: 1, team_name: 'Python security reviewers', team_status: 'active',
  badge_key: 'membership', qualifying_count: 0, threshold: null, awarded_at: now,
}, {
  team_id: 1, team_name: 'Python security reviewers', team_status: 'active',
  badge_key: 'contributor_milestone', qualifying_count: 10, threshold: 5, awarded_at: now,
}]
const panelSnapshot = JSON.parse(await readFile(resolve(root, 'scripts/oasis-pr-panel-snapshot.json'), 'utf8'))
const cweCatalog = {
  'CWE-20': ['Improper Input Validation', 7.5],
  'CWE-22': ['Path Traversal', 8.1],
  'CWE-79': ['Improper Neutralization of Input During Web Page Generation', 7.4],
  'CWE-89': ['SQL Injection', 8.8],
  'CWE-312': ['Cleartext Storage of Sensitive Information', 6.5],
  'CWE-352': ['Cross-Site Request Forgery', 6.5],
  'CWE-409': ['Improper Handling of Highly Compressed Data', 7.5],
  'CWE-434': ['Unrestricted Upload of File with Dangerous Type', 8.1],
  'CWE-532': ['Insertion of Sensitive Information into Log File', 5.5],
  'CWE-613': ['Insufficient Session Expiration', 6.5],
  'CWE-639': ['Authorization Bypass Through User-Controlled Key', 8.1],
  'CWE-798': ['Use of Hard-coded Credentials', 7.5],
  'CWE-918': ['Server-Side Request Forgery', 9.1],
}
const repoTools = { react: 'OpenGrep', nest: 'OpenGrep', angular: 'OpenGrep', playwright: 'OpenGrep', express: 'OpenGrep', flask: 'OpenGrep', 'open-webui': 'OpenGrep', pandas: 'OpenGrep', numpy: 'OpenGrep', 'scikit-learn': 'OpenGrep', vue: 'OpenGrep', fastapi: 'OpenGrep', 'railguard-skill': 'OpenGrep' }
const detailCatalog = new Map(candidateFixes.map(row => {
  const cwe = String(row[4]).match(/CWE-\d+/)?.[0] ?? ''
  const panel = panelSnapshot[String(row[0])]
  const [cweDesc, score] = cweCatalog[cwe] ?? [String(row[4]).match(/CWE-\d+\s*\(([^)]+)\)/)?.[1] ?? 'Security weakness', null]
  const severity = String(row[4]).match(/\b(Critical|High|Medium|Low)\s+severity/i)?.[1] ?? 'Medium'
  const repoName = String(row[2])
  return [row[0], {
    cwe, cweDesc, score, severity, detectionTool: repoTools[repoName] ?? 'OASIS analyzer',
    cve: null,
    tldr: `The ${repoName} patch adds a focused ${cweDesc.toLowerCase()} guard and keeps the security-sensitive path covered by a regression test.`,
    body: `## Security fix\n\nThis candidate addresses ${cwe} (${cweDesc}) in ${repoName}. The change validates untrusted input at the boundary, preserves the existing behavior for valid requests, and adds coverage for the reported exploit path.`,
    panel,
  }]
}))
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://127.0.0.1:' + port)
    const persona = /(?:^|; )teams_demo_persona=([^;]*)/.exec(req.headers.cookie || '')?.[1] || 'demo-owner'
    if (url.pathname === '/__demo/persona') {
      const choice = url.searchParams.get('as')
      if (![...identities, 'public'].includes(choice)) { res.writeHead(400); res.end(); return }
      res.writeHead(303, { location: '/workspace/teams', 'set-cookie': 'teams_demo_persona=' + choice + '; Path=/; HttpOnly; SameSite=Strict' })
      res.end(); return
    }
    if (url.pathname === '/__demo/avatar.svg') {
      res.writeHead(200, { 'content-type': 'image/svg+xml' }); res.end('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" rx="16" fill="#d9ebe3"/><text x="16" y="21" text-anchor="middle" font-size="15" fill="#136049">D</text></svg>'); return
    }
    if (url.pathname.startsWith('/api/')) {
      if (!allowedAPI.test(url.pathname)) { res.writeHead(403, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: 'This action is outside the local Teams preview.' })); return }
      if (req.method === 'GET' && url.pathname === '/api/workspace/contributors') {
        res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify([mockContributor])); return
      }
      if (req.method === 'GET' && url.pathname.startsWith('/api/contributors/demo-')) {
        const login = url.pathname.split('/').at(-1)
        res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify({ contributor: { ...mockContributor, login }, allTimeRank: identities.indexOf(login) + 1, contributions: [], public_badges: mockPublicBadges })); return
      }
      if (req.method === 'GET' && /\/api\/pr-panel\/\d+\/details$/.test(url.pathname)) {
        const prId = Number(url.pathname.split('/')[3])
        const row = candidateFixes.find(item => item[0] === prId) ?? candidateFixes[0]
        const repo = repoByName.get(row[2])
        const detail = detailCatalog.get(prId) ?? detailCatalog.get(100)
        const source = detail.panel?.details
        res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify({ ok: true, title: row[4], number: row[3], state: row[5], html_url: repo?.full_name ? `https://github.com/${repo.full_name}/pull/${row[3]}` : row[12], body: source?.body ?? detail.body, user: source?.user ?? { login: row[11], avatar_url: '/__demo/avatar.svg' }, created_at: source?.created_at ?? row[18], updated_at: source?.updated_at ?? row[19], merged_at: source?.merged_at ?? row[17] ?? null, additions: source?.additions ?? row[0] % 4 + 4, deletions: source?.deletions ?? row[0] % 3 + 1, changed_files: source?.changed_files ?? row[0] % 3 + 1, head_sha: row[21] ?? null, cwe_id: source?.cwe_id ?? detail.cwe, cwe_desc: source?.cwe_desc ?? detail.cweDesc, cvss_severity: source?.cvss_severity ?? detail.severity, cve_id: source?.cve_id ?? null, capec_id: source?.capec_id ?? null, cvss_score: source?.cvss_score ?? detail.score, tldr: source?.tldr ?? detail.tldr, detection_tool: source?.detection_tool ?? detail.detectionTool })); return
      }
      if (req.method === 'GET' && /\/api\/pr-panel\/\d+\/files$/.test(url.pathname)) {
        const prId = Number(url.pathname.split('/')[3]); const row = candidateFixes.find(item => item[0] === prId) ?? candidateFixes[0]; const panelFiles = panelSnapshot[String(prId)]?.files; const extension = row[2] === 'react' || row[2] === 'express' || row[2] === 'vue' ? 'js' : row[2] === 'nest' || row[2] === 'angular' || row[2] === 'playwright' ? 'ts' : 'py'; const base = `src/security/validate.${extension}`
        const files = [{ filename: base, status: 'modified', additions: 4 + (prId % 4), deletions: 2, changes: 6 + (prId % 4), patch: '@@ -10,3 +10,8 @@\n-  return input\n+  const normalized = input.trim()\n+  if (!normalized) throw new Error("Input is required")\n+  return normalized\n+\n+  // Regression coverage protects the reported security boundary.' }, { filename: row[2] === 'webgoat' ? 'src/test/java/security/FixTest.java' : 'test/security-regression.spec.ts', status: 'added', additions: 12, deletions: 0, changes: 12, patch: '@@ -0,0 +1,12 @@\n+describe(\'security regression\', () => {\n+  it(\'rejects the reported exploit input\', () => {\n+    expect(validate(untrustedInput)).toThrow()\n+  })\n+})' }]
        res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify({ ok: true, files: panelFiles ?? files })); return
      }
      if (req.method === 'GET' && /\/api\/pr-panel\/\d+\/comments$/.test(url.pathname)) {
        const prId = Number(url.pathname.split('/')[3]); const row = candidateFixes.find(item => item[0] === prId) ?? candidateFixes[0]; const comments = panelSnapshot[String(prId)]?.comments ?? (prId % 3 === 0 ? [{ id: prId * 10 + 1, user: { login: 'casey-maintainer', avatar_url: '/__demo/avatar.svg' }, body: 'Please keep the regression test close to the validation boundary.', created_at: new Date(Date.now() - 2 * 86400000).toISOString(), reactions: { total_count: 2, '+1': 2, '-1': 0, laugh: 0, hooray: 0, confused: 0, heart: 0, rocket: 0, eyes: 0 }, oasis_decision: null }] : [{ id: prId * 10 + 1, user: { login: 'alice-validator', avatar_url: '/__demo/avatar.svg' }, body: `Reviewed ${row[2]} #${row[3]} against the reported ${String(row[4]).match(/CWE-\d+/)?.[0] ?? 'weakness'}.`, created_at: new Date(Date.now() - 3 * 86400000).toISOString(), reactions: { total_count: 3, '+1': 2, '-1': 0, laugh: 0, hooray: 1, confused: 0, heart: 0, rocket: 0, eyes: 0 }, oasis_decision: 'accept' }])
        res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify({ ok: true, comments })); return
      }
      if (req.method === 'POST' && /\/api\/pr-panel\/\d+\/comments$/.test(url.pathname)) {
        let requestBody = ''
        for await (const chunk of req) requestBody += chunk
        let parsed = {}
        try { parsed = JSON.parse(requestBody) } catch { /* the real Worker validates malformed JSON */ }
        const body = typeof parsed.body === 'string' ? parsed.body : ''
        res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify({ ok: true, comment: { id: Date.now(), user: { login: persona, avatar_url: '/__demo/avatar.svg' }, body, created_at: new Date().toISOString(), reactions: { total_count: 0, '+1': 0, '-1': 0, laugh: 0, hooray: 0, confused: 0, heart: 0, rocket: 0, eyes: 0 }, oasis_decision: null } })); return
      }
      const headers = new Headers()
      for (const [key, value] of Object.entries(req.headers)) if (typeof value === 'string' && !['host', 'content-length', 'connection'].includes(key)) headers.set(key, value)
      const cookies = (req.headers.cookie || '').split(';').filter(cookie => !cookie.trim().startsWith('__session=') && !cookie.trim().startsWith('__gh_token=')).join(';')
      headers.set('cookie', cookies + (sessions[persona] ? '; __session=' + sessions[persona] : ''))
      let body
      if (!['GET', 'HEAD'].includes(req.method)) {
        const chunks = []
        for await (const chunk of req) chunks.push(chunk)
        body = Buffer.concat(chunks)
      }
      const response = await runtime.dispatchFetch(url.href, { method: req.method, headers, body })
      response.headers.forEach((value, key) => { if (!['content-encoding', 'content-length'].includes(key)) res.setHeader(key, value) })
      res.setHeader('cache-control', 'no-store')
      res.writeHead(response.status)
      res.end(Buffer.from(await response.arrayBuffer())); return
    }
    const dist = resolve(root, 'dist')
    const filename = resolve(dist, '.' + decodeURIComponent(url.pathname))
    if (!filename.startsWith(dist + sep)) { res.writeHead(403); res.end(); return }
    let content
    let html = false
    try { content = await readFile(filename) } catch { content = await readFile(resolve(dist, 'index.html')); html = true }
    if (html || extname(filename) === '.html') {
      const toolbar = '<aside style="padding:9px 16px;background:#fff6da;border-bottom:1px solid #dfd0a7;color:#594b21;font:12px system-ui;display:flex;gap:12px;flex-wrap:wrap;align-items:center"><strong>LOCAL UX PREVIEW</strong><span>Curated OASIS repository snapshot · saved in this session · viewing as ' + (identities.includes(persona) ? persona : 'public') + '</span>' + [...identities, 'public'].map(login => '<a style="color:#594b21;text-decoration:underline" href="/__demo/persona?as=' + login + '">' + login.replace('demo-', '') + '</a>').join('') + '</aside>'
      content = content.toString().replace('<body>', '<body>' + toolbar)
    }
    res.writeHead(200, { 'content-type': html ? 'text/html' : types[extname(filename)] || 'text/html', 'cache-control': 'no-store' })
    res.end(content)
  } catch (error) { console.error(error.message); res.writeHead(500); res.end('Local preview failed. Check the terminal.') }
})
server.listen(port, '127.0.0.1', () => console.log('Local Teams preview: http://127.0.0.1:' + port + '/workspace/teams'))
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, async () => { server.close(); await runtime.dispose(); process.exit(0) })
