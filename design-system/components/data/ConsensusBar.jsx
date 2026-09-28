import React from 'react';
export function ConsensusBar({ accept, modify, reject, duplicate = 0, showLegend = true }) {
  const t = Math.max(1, accept + modify + reject + duplicate);
  const seg = [['accept', accept, 'Accept'], ['modify', modify, 'Modify'], ['reject', reject, 'Reject'], ['duplicate', duplicate, 'Duplicate']];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', height: 8, borderRadius: 100, overflow: 'hidden', background: 'var(--gray-200)' }}>
        {seg.map(([k, n]) => n > 0 && <span key={k} style={{ width: (n / t * 100) + '%', background: `var(--dec-${k})` }}/>)}
      </div>
      {showLegend && <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12, color: 'var(--ink-soft)' }}>
        {seg.filter(s => s[1] > 0).map(([k, n, l]) => <span key={k} style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: `var(--dec-${k})` }}/>{l} <b style={{ fontFamily: 'var(--mono)' }}>{n}</b></span>)}
      </div>}
    </div>
  );
}