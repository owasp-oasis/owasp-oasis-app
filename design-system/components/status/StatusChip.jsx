import React from 'react';
const M = {"needs":["var(--status-needs-bg)","var(--status-needs-fg)","Needs review"],"trusted":["var(--status-trusted-bg)","var(--status-trusted-fg)","Trusted"],"accepted":["var(--status-accepted-bg)","var(--status-accepted-fg)","Accepted"],"withdrawn":["var(--status-withdrawn-bg)","var(--status-withdrawn-fg)","Withdrawn"],"rejected":["var(--status-rejected-bg)","var(--status-rejected-fg)","Rejected"]};
export function StatusChip({ status, label }) {
  const [bg, fg, text] = M[status];
  return <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 100, background: bg, color: fg, fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{label || text}</span>;
}