import React from 'react';
const M = {"accept":["var(--dec-accept-bg)","var(--dec-accept-fg)","Accept"],"modify":["var(--dec-modify-bg)","var(--dec-modify-fg)","Modify"],"reject":["var(--dec-reject-bg)","var(--dec-reject-fg)","Reject"],"duplicate":["var(--dec-duplicate-bg)","var(--dec-duplicate-fg)","Duplicate"]};
export function DecisionChip({ decision, label }) {
  const [bg, fg, text] = M[decision];
  return <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 100, background: bg, color: fg, fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{label || text}</span>;
}