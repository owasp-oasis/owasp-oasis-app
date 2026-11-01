// Local-only walkthrough: real Worker + persistent isolated D1 + simulated GitHub.
// Not imported by production. Binds loopback and blocks all outbound network.
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { createServer } from 'node:http'
import { readFile, readdir, mkdir } from 'node:fs/promises'
import { dirname, extname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const port = Number(process.env.ROLES_PREVIEW_PORT || 5193)
const origin = `http://127.0.0.1:${port}`
const people = {
  newcomer: { id: 91001, login: 'demo-newcomer', email: 'new@oasis-demo.internal' },
  member: { id: 91002, login: 'demo-member', email: 'member@oasis-demo.internal' },
}
const state = resolve(root, '.wrangler/role-walkthrough')
await mkdir(state, { recursive: true })
const runtime = new Miniflare(convertV4MiniflareOptions({
  modules: [{ type: 'ESModule', path: resolve(root, 'dist-worker/index.js') }, ...(await readdir(resolve(root, 'dist-worker'), { recursive: true })).filter(name => name.endsWith('.js') && name !== 'index.js').map(name => ({ type: 'ESModule', path: resolve(root, 'dist-worker', name) }))],
  modulesRoot: resolve(root, 'dist-worker'), compatibilityDate: '2026-06-10',
  d1Databases: ['DB'], resourcePersistencePath: state, kvNamespaces: ['RATE_KV'],
  bindings: { ENVIRONMENT: 'development', TOKEN_ENCRYPTION_KEY: 'local-role-preview-key-not-a-secret', GITHUB_CLIENT_ID: 'local-demo', GITHUB_CLIENT_SECRET: 'local-demo', OAUTH_CALLBACK_URL: origin + '/api/auth/callback', WELCOME_EMAIL_MODE: 'off' },
  outboundService: async request => {
    const url = new URL(request.url)
    if (url.href === 'https://github.com/login/oauth/access_token') {
      const { code } = await request.json()
      return Response.json(people[code] ? { access_token: code } : { error: 'Unknown demo identity' })
    }
    const person = people[request.headers.get('Authorization')?.replace('Bearer ', '')]
    if (url.href === 'https://api.github.com/user' && person) return Response.json({ ...person, avatar_url: '/__walkthrough/avatar.svg' })
    if (url.href === 'https://api.github.com/user/emails' && person) return Response.json([{ email: person.email, primary: true, verified: true }])
    if (url.origin === 'https://api.github.com' && url.pathname.startsWith('/users/')) {
      const login = decodeURIComponent(url.pathname.slice(7))
      if (!/^[a-zA-Z0-9][a-zA-Z0-9-]{0,38}$/.test(login)) return Response.json({ message: 'Invalid simulated GitHub username.' }, { status: 404 })
      const match = Object.values(people).find(value => value.login.toLowerCase() === login.toLowerCase())
      const id = match?.id ?? 920000 + [...login.toLowerCase()].reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) % 100000000, 7)
      return Response.json({ id, login: match?.login ?? login, type: 'User', avatar_url: '/__walkthrough/avatar.svg' })
    }
    return new Response('External requests are disabled in this local walkthrough.', { status: 503 })
  },
}))
const db = await runtime.getD1Database('DB')
const rateKv = await runtime.getKVNamespace('RATE_KV')
const schema = (await readFile(resolve(root, 'schema.sql'), 'utf8')).replace(/--[^\n]*/g, '')
for (const statement of schema.split(';').map(value => value.trim()).filter(Boolean)) await db.prepare(statement).run()
// Keep a walkthrough database created by an earlier version compatible with additive local schema changes.
for (const table of ['contribution_profiles', 'registration_role_interests']) {
  const columns = (await db.prepare(`PRAGMA table_info("${table}")`).all()).results.map(row => row.name)
  if (!columns.includes('other_interest')) await db.prepare(`ALTER TABLE "${table}" ADD COLUMN other_interest TEXT NOT NULL DEFAULT ''`).run()
}
async function seedDemoData() {
const now = new Date().toISOString()
for (const person of [people.member]) {
  await db.prepare(`INSERT OR IGNORE INTO registrations (name,email,github,role,ip_hash,created_at) VALUES (?, ?, ?, 'general', 'local-demo', ?)`)
    .bind(person.login, person.email, person.login, now).run()
  await db.prepare('INSERT OR IGNORE INTO contribution_profiles (github_user_id,github_login,created_at) VALUES (?,?,?)').bind(person.id, person.login, now).run()
}
for (const [id, name, language] of [[92001, 'atlas-api', 'TypeScript'], [92002, 'beacon-web', 'Python']]) {
  await db.prepare('INSERT OR IGNORE INTO repos (id, name, full_name, language, description, synced_at) VALUES (?,?,?,?,?,?)').bind(id, name, 'demo-org/' + name, language, 'Fictional repository for the role walkthrough.', now).run()
}
for (const person of Object.values(people)) await db.prepare("INSERT OR IGNORE INTO contributors (login, avatar_url, synced_at) VALUES (?, '/__walkthrough/avatar.svg', ?)").bind(person.login,now).run()
}
async function resetDemoData() {
  const tables = (await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all()).results.filter(row => !row.name.startsWith('_')).map(row => row.name)
  let remaining = new Set(tables)
  const dependencies = new Map()
  for (const table of tables) {
    const refs = (await db.prepare(`PRAGMA foreign_key_list("${table.replaceAll('"', '""')}")`).all()).results.map(row => row.table)
    dependencies.set(table, refs)
  }
  while (remaining.size) {
    const leaves = [...remaining].filter(table => ![...remaining].some(child => child !== table && dependencies.get(child).includes(table)))
    if (!leaves.length) throw new Error('Could not safely reset local walkthrough tables')
    for (const table of leaves) {
      try { await db.prepare(`DELETE FROM "${table.replaceAll('"', '""')}"`).run() }
      catch (error) { throw new Error(`Could not clear local table ${table}: ${error instanceof Error ? error.message : 'unknown D1 error'}`) }
      remaining.delete(table)
    }
  }
  try { await db.prepare('DELETE FROM sqlite_sequence').run() } catch { /* no autoincrement tables */ }
  let cursor
  do {
    const page = await rateKv.list(cursor ? { cursor } : {})
    await Promise.all(page.keys.map(key => rateKv.delete(key.name)))
    cursor = page.list_complete ? undefined : page.cursor
  } while (cursor)
  await seedDemoData()
}
await seedDemoData()
const types = { '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon' }
function headersFor(req) {
  const headers = new Headers()
  for (const [key, value] of Object.entries(req.headers)) if (typeof value === 'string' && !['host', 'content-length', 'connection'].includes(key)) headers.set(key, value)
  return headers
}
function sendHeaders(res, response) {
  response.headers.forEach((value,key) => { if (!['set-cookie','content-encoding','content-length'].includes(key)) res.setHeader(key, value) })
  const cookies = response.headers.getSetCookie()
  if (cookies.length) res.setHeader('set-cookie', cookies.map(cookie => cookie.replace(/; Secure/gi, '')))
  res.setHeader('cache-control','no-store')
}
const toolbar = `<aside style="background:#07111f;color:white;padding:10px 16px;font:12px system-ui;display:flex;gap:16px;flex-wrap:wrap;align-items:center"><strong>LOCAL ROLE WALKTHROUGH</strong><span>Saved locally · simulated GitHub · no external writes</span><a style="color:#9fd0ff" href="/__walkthrough/signup">1. New signup</a><a style="color:#9fd0ff" href="/__walkthrough/login?as=member">2. Existing member</a><a style="color:#9fd0ff" href="/__walkthrough/login?as=newcomer">Return as new member</a><details><summary style="cursor:pointer">Walkthrough steps</summary><p>Sign up using any name and <b>new@oasis-demo.internal</b>; leave GitHub blank or enter any syntactically valid username; GitHub account checks are simulated locally. Select interests, submit, then go to the workspace and sign in to use the demo-newcomer identity and link by the verified demo email.</p><p>Existing member: edit role interests in Preferences. Data survives page refresh and server restart.</p><p><a style="color:#9fd0ff" href="/workspace/preferences">My preferences</a></p></details><form method="post" action="/__walkthrough/reset"><button style="color:#fff;background:#8f3030;border:0;border-radius:5px;padding:7px 10px;cursor:pointer">Reset local data</button></form></aside>`
const server = createServer(async (req,res) => {
  try {
    // Bind to loopback and reject cross-origin requests to the demo login controls.
    if (req.headers.host !== `127.0.0.1:${port}` && req.headers.host !== `localhost:${port}`) { res.writeHead(403); res.end(); return }
    if (req.headers.origin && req.headers.origin !== origin && req.headers.origin !== `http://localhost:${port}`) { res.writeHead(403); res.end(); return }
    if (req.headers['sec-fetch-site'] === 'cross-site') { res.writeHead(403); res.end(); return }
    const url = new URL(req.url, origin)
    if (url.pathname === '/__walkthrough/reset') {
      if (req.method !== 'POST') { res.writeHead(405, { allow: 'POST' }); res.end(); return }
      const requestOrigin = `http://${req.headers.host}`
      if (req.headers.origin !== requestOrigin || !['same-origin', 'same-site'].includes(req.headers['sec-fetch-site'] ?? '')) { res.writeHead(403); res.end(); return }
      await resetDemoData()
      res.writeHead(303, { location: '/__walkthrough/signup', 'set-cookie': ['__session=; Path=/; Max-Age=0', '__gh_token=; Path=/api; Max-Age=0'] })
      res.end(); return
    }
    if (url.pathname === '/__walkthrough/signup') {
      res.writeHead(303,{location:'/#register-form','set-cookie':['__session=; Path=/; Max-Age=0','__gh_token=; Path=/api; Max-Age=0']});res.end();return
    }
    if (url.pathname === '/__walkthrough/login' || url.pathname === '/api/auth/login') {
      const as = url.searchParams.get('as') || 'newcomer'
      if (!people[as]) { res.writeHead(400);res.end();return }
      const response = await runtime.dispatchFetch(origin+'/api/auth/login',{headers:headersFor(req),redirect:'manual'})
      const oauthState = new URL(response.headers.get('location')).searchParams.get('state')
      sendHeaders(res,response)
      res.setHeader('location',`/api/auth/callback?code=${as}&state=${oauthState}`)
      res.writeHead(302);res.end();return
    }
    if (url.pathname === '/__walkthrough/avatar.svg') {
      res.writeHead(200,{'content-type':'image/svg+xml'});res.end('<svg xmlns="http://www.w3.org/2000/svg" width="56" height="56"><rect width="56" height="56" rx="28" fill="#e8f9ef"/><text x="28" y="35" text-anchor="middle" font-family="sans-serif" font-size="20" fill="#0b7a40">D</text></svg>');return
    }
    if (url.pathname.startsWith('/api/analytics/')) { res.writeHead(204); res.end(); return }
    if (url.pathname.startsWith('/api/')) {
      const chunks=[]
      for await (const chunk of req) chunks.push(chunk)
      const response=await runtime.dispatchFetch(url.href,{method:req.method,headers:headersFor(req),redirect:'manual',body:['GET','HEAD'].includes(req.method)?undefined:Buffer.concat(chunks)})
      sendHeaders(res,response)
      if (url.pathname === '/api/auth/callback' && response.status === 302 && !response.headers.get('location')?.includes('auth_error')) res.setHeader('location', '/workspace/preferences#my-roles')
      res.writeHead(response.status);res.end(Buffer.from(await response.arrayBuffer()));return
    }
    if (url.pathname === '/mockups/member-roles') {res.writeHead(302,{location:url.searchParams.get('view')==='profile'?'/__walkthrough/login?as=member':'/__walkthrough/signup'});res.end();return}
    const dist=resolve(root,'dist'); const file=resolve(dist,'.'+decodeURIComponent(url.pathname))
    if (file !== dist && !file.startsWith(dist+sep)) {res.writeHead(403);res.end();return}
    let content, html=false
    try {content=await readFile(file)} catch {content=await readFile(resolve(dist,'index.html'));html=true}
    if (html || extname(file)==='.html') content=content.toString().replace('<body>','<body>'+toolbar)
    res.writeHead(200,{'content-type':html?'text/html':types[extname(file)]||'application/octet-stream','cache-control':'no-store'});res.end(content)
  } catch (error) {console.error('Local role walkthrough request failed:', error instanceof Error ? error.message : 'unknown error');res.writeHead(500);res.end('Local walkthrough error. See the terminal.')}
})
server.listen(port,'127.0.0.1',()=>console.log(`Role walkthrough: ${origin}/__walkthrough/signup`))
for (const signal of ['SIGTERM','SIGINT']) process.on(signal,async()=>{server.close();await runtime.dispose();process.exit(0)})
