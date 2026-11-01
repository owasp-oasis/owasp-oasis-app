import { env } from 'cloudflare:test'
import { describe, beforeAll, afterEach, it, expect } from 'vitest'
import { SELF } from './testWorker.js'
import { applySchema, cleanDB, createTestSession, buildCookieHeader, makeCsrf, insertTestRepo } from './helpers.js'
import { linkContributionProfile } from '../../../worker/contributionIdentity.js'
import { fetchMock } from './fetchMock.js'
const mine = '/api/contribution-roles/mine'
const admin = '/api/admin/contribution-roles'
async function session(id = 501, login = 'member-one') { return createTestSession(env, { github_user_id: id, github_login: login }) }
async function request(path: string, auth?: Awaited<ReturnType<typeof session>>, method = 'GET', body?: unknown, csrf = true) {
  const token = makeCsrf()
  return SELF.fetch(new Request('http://localhost' + path, { method, headers: { 'content-type': 'application/json', ...(auth ? {cookie: buildCookieHeader(auth.sessionCookie, `__csrf=${token}`)} : {cookie:`__csrf=${token}`}), ...(csrf ? {'x-csrf-token':token} : {}) }, body: body === undefined ? undefined : JSON.stringify(body) }))
}
describe('contribution interests and repository assignments', () => {
  beforeAll(() => applySchema(env))
  afterEach(async () => { fetchMock.deactivate(); await cleanDB(env) })
  it('requires session identity and rejects legacy sessions until sign-in', async () => {
    expect((await request(mine)).status).toBe(401)
    expect((await request(admin)).status).toBe(401)
    const legacy = await createTestSession(env)
    expect((await request(mine, legacy)).status).toBe(409)
  })
  it('stores, reloads, deduplicates and clears interests without inferring an initial role', async () => {
    const auth = await session()
    expect((await (await request(mine, auth)).json()).profile).toMatchObject({ interests: [], interests_updated_at: null, assignments: [] })
    expect((await request(mine, auth, 'PUT', { interests:['steward','validator','steward'] })).status).toBe(200)
    expect((await (await request(mine, auth)).json()).profile.interests).toEqual(['validator','steward'])
    expect((await request(mine, auth, 'PUT', { interests:[] })).status).toBe(200)
    const profile = (await (await request(mine, auth)).json()).profile
    expect(profile.interests).toEqual([]); expect(profile.interests_updated_at).not.toBeNull()
  })
  it('requires and saves a short description for Other, and clears it when deselected', async () => {
    const auth = await session()
    expect((await request(mine, auth, 'PUT', { interests:['other'] })).status).toBe(400)
    expect((await request(mine, auth, 'PUT', { interests:['other'], other_interest:'  Accessibility reviews  ' })).status).toBe(200)
    expect((await (await request(mine, auth)).json()).profile).toMatchObject({ interests:['other'], other_interest:'Accessibility reviews' })
    expect((await request(mine, auth, 'PUT', { interests:[], other_interest:'' })).status).toBe(200)
    expect((await (await request(mine, auth)).json()).profile.other_interest).toBe('')
    expect((await request(mine, auth, 'PUT', { interests:['validator'], other_interest:'Please select Other' })).status).toBe(400)
    expect((await request(mine, auth, 'PUT', { interests:['other'], other_interest:'x'.repeat(241) })).status).toBe(400)
  })
  it('enforces CSRF and validation and prevents changing another member or access permissions', async () => {
    const auth = await session()
    expect((await request(mine, auth, 'PUT', { interests:['validator'] }, false)).status).toBe(403)
    for (const body of [{interests:['admin']},{interests:'steward'},{interests:null},{interests:Array(10).fill('validator')},{interests:[],github_user_id:502},{interests:[],assignments:[]}]) expect((await request(mine, auth, 'PUT', body)).status).toBe(400)
    expect((await request(admin,auth,'POST',{action:'assign',github_user_id:501,repo_id:1,role:'steward'})).status).toBe(403)
    expect((await (await request('/api/auth/me',auth)).json()).user.role).toBe('member')
  })
  it('keeps interests with immutable identity across username changes and private to their owner', async () => {
    const auth = await session()
    await request(mine,auth,'PUT',{interests:['mentor']})
    const renamed = await session(501,'member-renamed')
    expect((await (await request(mine,renamed)).json()).profile).toMatchObject({github_login:'member-renamed',interests:['mentor']})
    const other = await session(502,'member-one')
    expect((await (await request(mine,other)).json()).profile.interests).toEqual([])
    expect((await request(admin+'?member=501',other)).status).toBe(403)
  })
  it('stores signup interests atomically and duplicate public signup cannot overwrite them', async () => {
    const body={name:'Sample Member',email:'sample@oasis-demo.internal',interests:['contact','steward','other'],other_interest:'Documentation improvements'}
    const first = await request('/api/register',undefined,'POST',body)
    expect(first.status).toBe(200); expect((await first.json()).role_interests_saved).toBe(true)
    const duplicate = await request('/api/register',undefined,'POST',{...body,interests:['operator'],other_interest:''})
    expect(duplicate.status).toBe(200); expect((await duplicate.json()).role_interests_saved).toBe(false)
    const row=await env.DB.prepare('SELECT interests,other_interest FROM registration_role_interests').first<{interests:string;other_interest:string}>()
    expect(JSON.parse(row!.interests)).toEqual(['steward','contact','other']);expect(row!.other_interest).toBe('Documentation improvements')
    await linkContributionProfile(env.DB,501,'member-one','sample@oasis-demo.internal')
    const auth=await session()
    expect((await (await request(mine,auth)).json()).profile).toMatchObject({interests:['steward','contact','other'],other_interest:'Documentation improvements'})
    await request(mine,auth,'PUT',{interests:[]})
    await linkContributionProfile(env.DB,501,'member-renamed','sample@oasis-demo.internal')
    expect((await (await request(mine,auth)).json()).profile.interests).toEqual([])
    await linkContributionProfile(env.DB,502,'other-member','sample@oasis-demo.internal')
    const other=await session(502,'other-member')
    expect((await (await request(mine,other)).json()).profile.interests).toEqual([])
  })
  it('rejects malformed signup interests without writing registration or outbox', async () => {
    expect((await request('/api/register',undefined,'POST',{name:'Sample Member',email:'sample@oasis-demo.internal',interests:['admin']})).status).toBe(400)
    expect((await request('/api/register',undefined,'POST',{name:'Sample Member',email:'sample@oasis-demo.internal',interests:['other']})).status).toBe(400)
    expect((await request('/api/register',undefined,'POST',{name:'Sample Member',email:'sample@oasis-demo.internal',interests:['validator'],other_interest:'unselected idea'})).status).toBe(400)
    expect(await env.DB.prepare('SELECT 1 FROM registrations').first()).toBeNull()
    expect(await env.DB.prepare('SELECT 1 FROM hubspot_sync_queue').first()).toBeNull()
  })
  it.each([true,false])('OAuth transfers signup interests only for verified email: %s',async verified => {
    await request('/api/register',undefined,'POST',{name:'Sample Member',email:'sample@oasis-demo.internal',interests:['steward']})
    fetchMock.activate();fetchMock.disableNetConnect()
    fetchMock.when(req=>req.url==='https://github.com/login/oauth/access_token').respondWith(Response.json({access_token:'local-test'}))
    fetchMock.when(req=>req.url==='https://api.github.com/user').respondWith(Response.json({id:501,login:'member-one'}))
    fetchMock.when(req=>req.url==='https://api.github.com/user/emails').respondWith(Response.json([{email:'sample@oasis-demo.internal',primary:true,verified}]))
    const state=makeCsrf()
    const response=await SELF.fetch(new Request(`http://localhost/api/auth/callback?code=test&state=${state}`,{headers:{cookie:`__oauth_state=${state}`}}))
    expect(response.status).toBe(302); expect(response.headers.get('location')).not.toContain('auth_error')
    const row=await env.DB.prepare('SELECT interests FROM contribution_profiles WHERE github_user_id = 501').first<{interests:string}>()
    expect(JSON.parse(row!.interests)).toEqual(verified?['steward']:[])
  })
  it('links signup interests using a verified secondary GitHub email', async () => {
    await request('/api/register',undefined,'POST',{name:'Sample Member',email:'sample@oasis-demo.internal',interests:['steward']})
    fetchMock.activate();fetchMock.disableNetConnect()
    fetchMock.when(req=>req.url==='https://github.com/login/oauth/access_token').respondWith(Response.json({access_token:'local-test'}))
    fetchMock.when(req=>req.url==='https://api.github.com/user').respondWith(Response.json({id:501,login:'member-one'}))
    fetchMock.when(req=>req.url==='https://api.github.com/user/emails').respondWith(Response.json([{email:'primary@oasis-demo.internal',primary:true,verified:true},{email:'sample@oasis-demo.internal',verified:true}]))
    const state=makeCsrf()
    const response=await SELF.fetch(new Request(`http://localhost/api/auth/callback?code=test&state=${state}`,{headers:{cookie:`__oauth_state=${state}`}}))
    expect(response.status).toBe(302)
    expect((await (await request(mine,await session())).json()).profile.interests).toEqual(['steward'])
  })
  it('does not link signup by a supplied handle or unverified email', async () => {
    await env.DB.prepare("INSERT INTO registrations (name,email,github,role,ip_hash,created_at) VALUES ('Example','other@oasis-demo.internal','member-one','validator','test','2026-10-31')").run()
    await env.DB.prepare("INSERT INTO registration_role_interests (registration_id,interests) SELECT id, '[\"steward\"]' FROM registrations").run()
    const auth=await session()
    expect((await (await request(mine,auth)).json()).profile.interests).toEqual([])
  })
  it('assigns, retries, ends and reassigns roles with atomic audit and no interest or privilege changes', async () => {
    const auth=await session(), lead=await session(7505051,'humor4fun')
    await request(mine,auth,'PUT',{interests:['validator']}); const repo=await insertTestRepo(env)
    const body={github_user_id:501,repo_id:repo.id,role:'steward',action:'assign'}
    expect((await request(admin,lead,'POST',body,false)).status).toBe(403)
    expect((await request(admin,lead,'POST',body)).status).toBe(200)
    const original=await env.DB.prepare('SELECT assigned_at FROM contribution_assignments').first()
    await request(admin,lead,'POST',body)
    expect(await env.DB.prepare('SELECT assigned_at FROM contribution_assignments').first()).toEqual(original)
    let profile=(await (await request(mine,auth)).json()).profile
    expect(profile.assignments).toHaveLength(1);expect(profile.interests).toEqual(['validator'])
    await request(mine,auth,'PUT',{interests:[]})
    expect((await (await request(mine,auth)).json()).profile.assignments[0].status).toBe('active')
    expect((await request(admin,lead,'POST',{...body,action:'end'})).status).toBe(200)
    profile=(await (await request(mine,auth)).json()).profile
    expect(profile.assignments[0].status).toBe('ended');expect(profile.assignments[0].ended_at).not.toBeNull()
    expect((await request(admin,lead,'POST',body)).status).toBe(200)
    const assignments = (await (await request(mine,auth)).json()).profile.assignments
    expect(assignments).toHaveLength(2)
    expect(assignments[0]).toMatchObject({status:'active',ended_at:null})
    expect(assignments[1]).toMatchObject({status:'ended'})
    const audit=await env.DB.prepare("SELECT github_user_id,role,action,outcome,target_id FROM privileged_action_audit WHERE action='contribution_assignment.end'").first()
    expect(audit).toMatchObject({github_user_id:7505051,role:'admin',outcome:'succeeded',target_id:`501:${repo.id}:steward`})
    expect((await (await request('/api/auth/me',auth)).json()).user.role).toBe('member')
  })
  it('validates assignment targets, role types and admin-only reads', async () => {
    const lead=await session(7505051,'humor4fun'), member=await session()
    await request(mine,member); const repo=await insertTestRepo(env)
    const body={github_user_id:501,repo_id:repo.id,role:'contact',action:'assign'}
    expect((await request(admin,member)).status).toBe(403)
    expect((await request(admin+'?member=501',lead)).headers.get('cache-control')).toBe('no-store')
    for(const patch of [{role:'admin'},{role:['steward']},{action:'remove'},{github_user_id:'501'},{repo_id:-1},{assigned_by:42}]) expect((await request(admin,lead,'POST',{...body,...patch})).status).toBe(400)
    expect((await request(admin,lead,'POST',{...body,github_user_id:999})).status).toBe(404)
    expect((await request(admin,lead,'POST',{...body,repo_id:999})).status).toBe(404)
    expect((await request(admin,lead,'POST',{...body,action:'end'})).status).toBe(404)
    await env.DB.prepare('UPDATE repos SET active=0 WHERE id=?').bind(repo.id).run()
    expect((await request(admin,lead,'POST',body)).status).toBe(400)
    expect(await env.DB.prepare('SELECT 1 FROM privileged_action_audit').first()).toBeNull()
  })
})
