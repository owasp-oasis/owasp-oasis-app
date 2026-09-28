import React from 'react';
const M = {"critical":["var(--sev-critical-bg)","var(--sev-critical-fg)","Critical"],"high":["var(--sev-high-bg)","var(--sev-high-fg)","High"],"medium":["var(--sev-medium-bg)","var(--sev-medium-fg)","Medium"],"low":["var(--sev-low-bg)","var(--sev-low-fg)","Low"]};
export function SeverityBadge({ severity, label }) {
  const [bg, fg, text] = M[severity];
  return <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 100, background: bg, color: fg, fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{label || text}</span>;
}