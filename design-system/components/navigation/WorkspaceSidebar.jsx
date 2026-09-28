import React from 'react';
const ITEMS = [['queue', 'My queue'], ['fixes', 'Candidate fixes'], ['projects', 'Projects'], ['validators', 'Validators'], ['maintainers', 'Maintainers']];
export function WorkspaceSidebar({ active, counts = {}, onNavigate }) {
  return (
    <aside style={{ width: 220, padding: '20px 14px', background: '#fff', borderRight: '1px solid var(--line)', display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ padding: '0 10px 8px', fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--muted)' }}>Workspace</span>
      {ITEMS.map(([id, l]) => { const on = id === active; return (
        <button key={id} onClick={() => onNavigate && onNavigate(id)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', border: 0, borderRadius: 7, background: on ? 'var(--blue-soft)' : 'transparent', color: on ? 'var(--blue-dark)' : 'var(--ink-soft)', fontSize: 14, fontWeight: 600, textAlign: 'left' }}>
          {l}{counts[id] != null && <span style={{ marginLeft: 'auto', fontFamily: 'var(--mono)', fontSize: 11, padding: '1px 7px', borderRadius: 100, background: on ? '#fff' : 'var(--gray-100)', color: 'var(--gray-600)' }}>{counts[id]}</span>}
        </button> ); })}
    </aside>
  );
}