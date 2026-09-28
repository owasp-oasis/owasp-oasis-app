import React from 'react';
export function SearchInput({ value, onChange, placeholder = 'Search PR #, repo, title, or CWE…' }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, height: 38, padding: '0 12px', background: 'var(--white)', border: '1px solid var(--line-strong)', borderRadius: 8, color: 'var(--muted)' }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={{ flex: 1, minWidth: 0, border: 0, outline: 0, background: 'transparent', fontSize: 14, color: 'var(--ink)' }}/>
    </label>
  );
}