import React from 'react';
const D = [['accept', 'Accept'], ['modify', 'Modify'], ['reject', 'Reject'], ['duplicate', 'Duplicate']];
export function VoteBar({ value, onChange, disabled }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 8 }}>
      {D.map(([k, l]) => { const on = value === k; return (
        <button key={k} disabled={disabled} aria-pressed={on} aria-keyshortcuts={l[0]} onClick={() => onChange(on ? null : k)}
          style={{ minHeight: 42, padding: '8px 10px', borderRadius: 8, fontSize: 14, fontWeight: 700, border: `2px solid var(--dec-${k})`, background: on ? `var(--dec-${k})` : `var(--dec-${k}-bg)`, color: on ? '#fff' : `var(--dec-${k}-fg)` }}>
          <span style={{ textDecoration: 'underline', textDecorationThickness: 2, textUnderlineOffset: 3 }}>{l[0]}</span>{l.slice(1)}
        </button> ); })}
    </div>
  );
}