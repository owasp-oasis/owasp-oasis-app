import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { env } from 'cloudflare:test'
import { SELF } from './testWorker.js'
import { applySchema, cleanDB, createTestSession, makeCsrf } from './helpers.js'
const url='http://localhost/api/preferences/workspace'
describe('Workspace preferences',()=>{
  beforeAll(()=>applySchema(env));beforeEach(()=>cleanDB(env))
  async function client(login='validator-one') {
    const session=await createTestSession(env,{github_login:login})
    const csrf=makeCsrf()
    const headers={'content-type':'application/json',Cookie:`${session.sessionCookie}; ${session.tokenCookie}; __csrf=${csrf}`,'x-csrf-token':csrf}
    return { get:()=>SELF.fetch(new Request(url,{headers})), put:(patch:unknown)=>SELF.fetch(new Request(url,{method:'PUT',headers,body:JSON.stringify(patch)})), headers }
  }
  it('requires authentication for reads and writes',async()=>{
    expect((await SELF.fetch(new Request(url))).status).toBe(401)
    expect((await SELF.fetch(new Request(url,{method:'PUT',body:'{}'}))).status).toBe(401)
  })
  it('requires matching CSRF before saving',async()=>{
    const c=await client(); const headers={...c.headers,'x-csrf-token':'invalid'}
    expect((await SELF.fetch(new Request(url,{method:'PUT',headers,body:'{"layout":"focus"}'}))).status).toBe(403)
    expect((await (await c.get()).json()).preferences.layout).toBe('split')
  })
  it('returns defaults with private cache policy',async()=>{
    const c=await client();const response=await c.get()
    expect(response.headers.get('cache-control')).toContain('no-store')
    expect((await response.json()).preferences).toMatchObject({repositories:[],cwes:[],layout:'split',diffView:'split',hideClosed:true,keyboardShortcuts:true})
  })
  it('persists partial updates without changing badge privacy or onboarding',async()=>{
    const c=await client()
    expect((await c.put({repositories:[41,42],cwes:['CWE-22'],minimumSeverity:'high'})).status).toBe(200)
    expect((await c.put({layout:'focus',keyboardShortcuts:false})).status).toBe(200)
    expect((await(await c.get()).json()).preferences).toMatchObject({repositories:[41,42],cwes:['CWE-22'],minimumSeverity:'high',layout:'focus',keyboardShortcuts:false})
    expect(await env.DB.prepare('SELECT * FROM user_preferences WHERE github_login = ?').bind('validator-one').first()).toBeNull()
  })
  it('keeps accounts isolated',async()=>{
    const first=await client('first');const second=await client('second')
    await first.put({layout:'focus'});await second.put({layout:'table'})
    expect((await(await first.get()).json()).preferences.layout).toBe('focus')
    expect((await(await second.get()).json()).preferences.layout).toBe('table')
  })
  it.each([null,[],{layout:['split']},{layout:'grid'},{repositories:[-1]},{repositories:['42']},{repositories:Array(501).fill(1)},{cwes:['<script>']},{hideClosed:'yes'},{minimumSeverity:'extreme'},{role:'admin'},{show_team_badges:true},{toString:true}])('rejects invalid or unrelated input %j',async patch=>{
    const c=await client();expect((await c.put(patch)).status).toBe(400)
  })
  it('rejects malformed and oversized JSON',async()=>{
    const c=await client()
    expect((await SELF.fetch(new Request(url,{method:'PUT',headers:c.headers,body:'{'}))).status).toBe(400)
    expect((await SELF.fetch(new Request(url,{method:'PUT',headers:c.headers,body:' '.repeat(17000)}))).status).toBe(413)
  })
  it('supports clearing selections and deduplicates IDs',async()=>{
    const c=await client();await c.put({repositories:[41,41],cwes:['CWE-22','CWE-22']})
    expect((await(await c.get()).json()).preferences.repositories).toEqual([41])
    await c.put({repositories:[],cwes:[]})
    expect((await(await c.get()).json()).preferences.cwes).toEqual([])
  })
})
