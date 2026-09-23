// Local UX review harness: real Worker handlers + isolated D1, synthetic identities.
// Never imported by the application or deployed. All outbound Worker requests are blocked.
import { Miniflare } from 'miniflare'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import { dirname, extname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const port = Number(process.env.TEAMS_PREVIEW_PORT || 4175)
const runtime = new Miniflare({
  modules: true, scriptPath: resolve(root, 'dist-worker/index.js'),
  modulesRules: [{ type: 'ESModule', include: ['**/*.js'], fallthrough: true }],
  compatibilityDate: '2026-06-10', // Available local workerd; production config stays unchanged.
  d1Databases: ['DB'], kvNamespaces: ['RATE_KV'],
  bindings: { ENVIRONMENT: 'development' },
  outboundService: () => new Response('External requests are disabled in this local preview.', { status: 503 }),
})
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
await db.prepare("INSERT INTO teams (id, name, description, membership_mode, owner_login, created_at, updated_at) VALUES (1, 'Python security reviewers', 'Small reviews. Safer Python projects. Join us in validating security fixes across the ecosystem.', 'request', 'demo-owner', ?, ?)")
  .bind(now, now).run()
await db.prepare("INSERT INTO teams (id, name, description, membership_mode, owner_login, created_at, updated_at) VALUES (2, 'Web application defenders', 'A community working together on authentication and safer web applications.', 'request', 'demo-admin', ?, ?)")
  .bind(now, now).run()
for (const [team, login, role] of [[1, 'demo-owner', 'owner'], [1, 'demo-admin', 'admin'], [1, 'demo-member', 'member'], [2, 'demo-admin', 'owner']]) {
  await db.prepare('INSERT INTO team_memberships (team_id, github_login, role, joined_at) VALUES (?, ?, ?, ?)').bind(team, login, role, now).run()
}
for (const [id, name, description] of [[41, 'sample-python-project', 'A sample Python repository for this local walkthrough.'], [42, 'sample-auth-library', 'A sample authentication library.'], [43, 'sample-web-framework', 'A sample web framework.']]) {
  await db.prepare('INSERT INTO repos (id, name, full_name, description) VALUES (?, ?, ?, ?)').bind(id, name, 'owasp-oasis/' + name, description).run()
}
await db.prepare("INSERT INTO team_repositories (team_id, repo_id, added_by, created_at) VALUES (1, 41, 'demo-owner', ?)").bind(now).run()
await db.prepare("INSERT INTO team_join_requests (team_id, requester_login, created_at) VALUES (1, 'demo-newcomer', ?)").bind(now).run()
await db.prepare("INSERT INTO team_invites (team_id, invitee_login, invited_by, created_at) VALUES (2, 'demo-owner', 'demo-admin', ?)").bind(now).run()
await db.prepare("INSERT INTO pull_requests (id, repo_id, repo_name, number, title, state, merged_upstream) VALUES (100, 41, 'sample-python-project', 42, 'Validate input before processing a request', 'closed', 1)").run()
await db.prepare("INSERT INTO user_votes (github_login, pr_id, repo_name, pr_number, decision, team_id, voted_at) VALUES ('demo-member', 100, 'sample-python-project', 42, 'accept', 1, ?)").bind(now).run()

const types = { '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon' }
const allowedAPI = /^\/api\/(teams(?:\/|$)|csrf$|auth\/(me|logout)$|preferences\/mine$|leaderboard\/(meta|repos|prs)$|votes\/mine$)/
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
      const toolbar = '<aside style="padding:9px 16px;background:#fff6da;border-bottom:1px solid #dfd0a7;color:#594b21;font:12px system-ui;display:flex;gap:12px;flex-wrap:wrap;align-items:center"><strong>LOCAL UX PREVIEW</strong><span>Sample data · saved in this session · viewing as ' + (identities.includes(persona) ? persona : 'public') + '</span>' + [...identities, 'public'].map(login => '<a style="color:#594b21;text-decoration:underline" href="/__demo/persona?as=' + login + '">' + login.replace('demo-', '') + '</a>').join('') + '</aside>'
      content = content.toString().replace('<body>', '<body>' + toolbar)
    }
    res.writeHead(200, { 'content-type': html ? 'text/html' : types[extname(filename)] || 'text/html', 'cache-control': 'no-store' })
    res.end(content)
  } catch (error) { console.error(error.message); res.writeHead(500); res.end('Local preview failed. Check the terminal.') }
})
server.listen(port, '127.0.0.1', () => console.log('Local Teams preview: http://127.0.0.1:' + port + '/workspace/teams'))
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, async () => { server.close(); await runtime.dispose(); process.exit(0) })
