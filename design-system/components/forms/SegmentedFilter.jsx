import React from 'react';
export function SegmentedFilter({ options, value, onChange }) {
  return (
    <div role="tablist" style={{ display: 'inline-flex', gap: 2, padding: 3, background: 'var(--gray-100)', border: '1px solid var(--line)', borderRadius: 9 }}>
      {options.map(o => { const on = o.id === value; return (
        <button key={o.id} role="tab" aria-selected={on} onClick={() => onChange(o.id)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', border: 0, borderRadius: 7, background: on ? 'var(--white)' : 'transparent', color: on ? 'var(--ink)' : 'var(--gray-600)', boxShadow: on ? 'var(--shadow-inset-selected)' : 'none', fontSize: 13, fontWeight: 600 }}>
          {o.label}{o.count != null && <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--muted)' }}>{o.count}</span>}
        </button> ); })}
    </div>
  );
}