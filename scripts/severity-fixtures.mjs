// Synthetic fixtures modeled on the public AppSecAI formats observed in XWiki
// and OFBiz. No production records, accounts, or vulnerability IDs are copied.
const table = (rows) => '## Vulnerabilities Addressed\n\n| # | Finding | Detection | Severity | Location | Status |\n| --- | --- | --- | --- | --- | --- |\n' + rows.map(([cwe, severity], i) => `| ${i+1} | Sample finding<br/>${cwe} | OpenGrep | ${severity} | src/main/java/demo/Sample.java:42 | Fixed |`).join('\n');
const intro = '## TL;DR\n\nSynthetic remediation for local severity review. This demonstrates the report format, not a verified vulnerability.\n\n';
const outro = '\n\n## How we fixed it\n\n- Added an explicit security boundary in this synthetic example.\n\n## How to verify\n\n- Compare the declared finding severity above with the panel badge.\n- Open Diff and Comments to verify that the review tabs load locally.\n';
export const repos = [
  { id:97001,name:'xwiki-format-demo',language:'Java' },
  { id:97002,name:'ofbiz-format-demo',language:'Java' },
  { id:97003,name:'legacy-format-demo',language:'JavaScript' },
].map(r=>({...r,full_name:`owasp-oasis/${r.name}`,description:'Synthetic report formats for local validation',fork:true,stargazers_count:0}));
const definitions = [
  [97001,1,'Fix CWE-200 (Information Disclosure) vulnerability in src/main/java/demo/LoginHandler.java:84', '- **Finding:** Information Disclosure, CWE-200; Medium severity.\n- **Location:** `src/main/java/demo/security/authentication/session/redirect/handlers/LoginHandler.java:84`.\n- **Detection:** OpenGrep rule `java.lang.security.audit.url-rewriting.url-rewriting`.\n- **Data path:** `showLogin` builds a redirect and passes it to `sendRedirect`. The synthetic change removes `encodeRedirectURL` from that call.\n- **Change scope:** `src/main/java/demo/security/authentication/session/redirect/handlers/LoginHandler.java`.', [['CWE-200','Medium']], 'medium'],
  [97001,2,'Fix 2 security vulnerabilities in src/main/java/demo/CookieResponse.java:62', '- AppSecAI fixed 2 grouped findings.\n- Missing HttpOnly Flag (CWE-1004).\n- Insecure Cookie (CWE-614).', [['CWE-1004','Medium'],['CWE-614','Medium']], 'medium'],
  [97002,1,'Fix CWE-502 (Unsafe Deserialization) vulnerability in src/main/java/demo/KeyReader.java:70', '- **Finding:** CWE-502, Unsafe Deserialization\n- **Severity:** Medium\n- Evidence quality is high.', [['CWE-502','Medium']], 'medium'],
  [97002,2,'Fix CWE-1357 (Reliance on Insufficiently Trustworthy Component) vulnerability in .github/workflows/demo.yml:46', '- **Finding:** Reliance on Insufficiently Trustworthy Component, CWE-1357; Medium severity.', [['CWE-1357','Medium']], 'medium'],
  [97003,1,'Critical severity CWE-89 (SQL Injection) in query.js', '- **Severity:** Low', [], 'critical'],
  [97003,2,'CWE-22 (Path Traversal) High Severity in paths.js', '- **Severity:** Medium', [], 'high'],
  [97003,3,'Low severity CWE-614 in cookies.js', '- **Severity:** Medium', [], 'low'],
  [97001,3,'Fix grouped findings with mixed severity in Sample.java', '- Two findings with different declared severities.', [['CWE-200','Medium'],['CWE-22','High']], 'high'],
  [97002,3,'Fix without a declared severity in Sample.java', '- Confidence: High\n- No severity classification supplied.', [], null],
];
export const fixtures = definitions.map(([repoId,number,title,finding,rows,expected],i)=>{
  const repo=repos.find(r=>r.id===repoId);
  const reportIntro = repoId === 97001 && number <= 2 ? '## TL;DR\n\n' : repoId === 97002 && number === 1 ? '## TL;DR\n\n- `KeyReader(File)` reads a caller-selected key file.\n- The change installs an explicit type restriction before `readObject()`.\n\n' : intro;
  return {expected,repoId,repoName:repo.name,id:98001+i,number,title,state:'open',body:reportIntro+'## What we found\n\n'+finding+'\n\n'+(rows.length?table(rows):'')+outro,html_url:`https://example.test/${repo.name}/pull/${number}`,user:{login:'appsecai-bot',avatar_url:'/__local/avatar.svg'},created_at:'2026-11-01T00:00:00Z',updated_at:'2026-11-23T12:00:00Z',merged_at:null,head:{sha:'synthetic-local-sha'},additions:1,deletions:1,changed_files:1};
});
export function githubResponse(url) {
  if(url.pathname==='/orgs/owasp-oasis/repos') return repos;
  const match=url.pathname.match(/^\/repos\/owasp-oasis\/([^/]+)(.*)$/);
  if(!match) throw new Error('Unexpected mock GitHub path');
  const [,name,path]=match; const repo=repos.find(r=>r.name===name);
  if(!repo) throw new Error('Unknown synthetic repository');
  if(!path) return repo;
  if(path==='/pulls') return url.searchParams.get('state')==='closed'?[]:fixtures.filter(f=>f.repoId===repo.id);
  if(/^\/issues\/\d+\/comments$/.test(path)) return [];
  const pr=fixtures.find(f=>f.repoId===repo.id && f.number===Number(path.split('/')[2]));
  if(!pr) throw new Error('Unknown synthetic PR');
  if(/^\/pulls\/\d+$/.test(path)) return pr;
  if(path.endsWith('/files')) return [{filename:'src/main/java/demo/Sample.java',status:'modified',additions:1,deletions:1,changes:2,patch:'@@ -40,3 +40,3 @@\n public void apply() {\n-    unsafeOperation();\n+    checkedOperation();\n }'}];
  throw new Error('Unexpected mock GitHub request');
}
