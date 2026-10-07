import { describe, expect, it } from 'vitest'
import { finding, matchesSearch, matchesPreferences, sortFixes, fixPath, lifecycle, type CandidateFix } from '../../src/pages/workspace/fixModel'
import { WORKSPACE_DEFAULTS } from '../../worker/workspacePreferences'
const fix={id:1,repo_id:41,repo_name:'react',number:14,title:'High severity CWE-22 (Path traversal) in compiler',state:'open',updated_at:'2026-09-01',consensus_accept:1,consensus_modify:0,consensus_reject:0,consensus_duplicate:0,participants:1,merged_upstream:0,html_url:'https://example.test/fix',comment_count:0} satisfies CandidateFix
describe('Workspace review queue',()=>{
  it.each(['14','#14','react 14','react #14','react#14','CWE-22','path traversal','compiler'])('finds number, repository, and finding queries: %s',query=>expect(matchesSearch(fix,query)).toBe(true))
  it.each(['vue#14','react#15','CWE-79','injection'])('does not match unrelated queries: %s',query=>expect(matchesSearch(fix,query)).toBe(false))
  it('retains unknown severity rather than inventing a classification',()=>expect(finding({...fix,title:'Fix input'}).severity).toBe('unknown'))
  it('combines watch lists, severity and review defaults',()=>{
    const prefs={...WORKSPACE_DEFAULTS,repositories:[41],cwes:['CWE-22'],minimumSeverity:'high' as const}
    expect(matchesPreferences(fix,prefs,new Map())).toBe(true)
    expect(matchesPreferences({...fix,repo_id:42},prefs,new Map())).toBe(false)
    expect(matchesPreferences(fix,prefs,new Map([[1,'accept']]))).toBe(false)
    expect(matchesPreferences({...fix,state:'closed'},prefs,new Map())).toBe(false)
  })
  it('sorts severity before activity and links immutable fix identity',()=>{
    const critical={...fix,id:2,number:15,title:'Critical severity CWE-79 (XSS)',updated_at:'2025-01-01'}
    expect(sortFixes([fix,critical])[0].id).toBe(2)
    expect(fixPath(fix)).toBe('/workspace/fixes/react/14')
  })
  it('keeps maintainer and upstream outcomes distinct',()=>{
    expect(lifecycle({...fix,maintainer_decision:'accepted'})).toBe('Maintainer Accepted')
    expect(lifecycle({...fix,upstream_status:'merged'})).toBe('Merged Upstream')
    expect(lifecycle({...fix,upstream_status:'closed'})).toBe('Closed Without Merge')
  })
})
