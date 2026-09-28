import React from 'react';
const G = { '+': ['var(--dec-accept-bg)', 'var(--dec-accept-fg)'], '-': ['var(--dec-reject-bg)', 'var(--dec-reject-fg)'], ' ': ['transparent', 'var(--ink-soft)'] };
const row = (t, s, n, k) => <div key={k} style={{ display: 'flex', background: G[t][0], color: G[t][1] }}><span style={{ width: 40, flex: 'none', textAlign: 'right', paddingRight: 8, color: 'var(--gray-400)' }}>{n}</span><span style={{ width: 16, flex: 'none' }}>{t.trim()}</span><span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', minWidth: 0 }}>{s}</span></div>;
export function DiffView({ file, lines, mode = 'split' }) {
  const box = { fontFamily: 'var(--mono)', fontSize: 12.5, lineHeight: 1.7 };
  let body;
  if (mode === 'unified') body = <div style={box}>{lines.map(([t, s], i) => row(t, s, i + 1, i))}</div>;
  else { const L = lines.filter(l => l[0] !== '+'), R = lines.filter(l => l[0] !== '-');
    body = <div style={{ ...box, display: 'grid', gridTemplateColumns: '1fr 1fr' }}><div style={{ borderRight: '1px solid var(--line)' }}>{L.map(([t, s], i) => row(t, s, i + 1, i))}</div><div>{R.map(([t, s], i) => row(t, s, i + 1, i))}</div></div>; }
  return <div style={{ border: '1px solid var(--line)', borderRadius: 8, overflow: 'hidden', background: '#fff' }}><div style={{ padding: '8px 12px', background: 'var(--gray-100)', borderBottom: '1px solid var(--line)', fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 600 }}>{file}</div>{body}</div>;
}