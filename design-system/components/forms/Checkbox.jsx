import React from 'react';
export function Checkbox({ checked, onChange, label, meta }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 7, background: checked ? 'var(--blue-soft)' : 'transparent', cursor: 'pointer' }}>
      <span style={{ width: 16, height: 16, borderRadius: 4, border: '1.5px solid ' + (checked ? 'var(--blue)' : 'var(--gray-400)'), background: checked ? 'var(--blue)' : '#fff', display: 'grid', placeItems: 'center', color: '#fff', fontSize: 11, flex: 'none' }}>{checked ? '✓' : ''}</span>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} style={{ position: 'absolute', opacity: 0, pointerEvents: 'none' }}/>
      <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>{label}</span>
      {meta && <span style={{ marginLeft: 'auto', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--muted)' }}>{meta}</span>}
    </label>
  );
}