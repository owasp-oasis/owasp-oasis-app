import React from 'react';
const row = { display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '9px 10px', border: 0, borderRadius: 7, background: 'transparent', color: 'var(--ink-soft)', fontSize: 14, fontWeight: 600, textAlign: 'left' };
export function AccountMenu({ login, role = 'Validator', rank, reputation, onPreferences, onSyncStatus, onSignOut }) {
  return (
    <div role="menu" style={{ width: 232, padding: 6, background: '#fff', border: '1px solid var(--line)', borderRadius: 10, boxShadow: 'var(--shadow-menu)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '8px 10px 10px', borderBottom: '1px solid var(--gray-200)', marginBottom: 4 }}>
        <b style={{ fontSize: 14 }}>{login}</b><span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--muted)' }}>{[role, rank && 'Rank ' + rank, reputation && reputation + ' rep'].filter(Boolean).join(' · ')}</span></div>
      <button role="menuitem" style={row} onClick={onPreferences}>Preferences</button>
      <button role="menuitem" style={row} onClick={onSyncStatus}>Sync status</button>
      <button role="menuitem" style={{ ...row, marginTop: 4, borderTop: '1px solid var(--gray-200)', borderRadius: '0 0 7px 7px' }} onClick={onSignOut}>Sign out</button>
    </div>
  );
}