import React from 'react';
export function InlineSearchResults({ label, placeholder, query, onQuery, status, results, actionLabel, onAction, fallback }) {
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 420 }}><span style={{ fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--ink-soft)' }}>{label}</span>
      <input type="search" value={query} onChange={e => onQuery(e.target.value)} placeholder={placeholder} style={{ minHeight: 38, padding: '9px 12px', border: '1px solid var(--line-strong)', borderRadius: 6, fontSize: 14 }} /></label>
    <p role="status" style={{ fontSize: 12, color: 'var(--muted)' }}>{status}</p>
    {results.length > 0 && <ul style={{ listStyle: 'none', border: '1px solid var(--line)', borderRadius: 8, overflow: 'hidden', maxWidth: 620 }}>
      {results.map(r => <li key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderTop: '1px solid var(--gray-200)' }}><div style={{ flex: 1, minWidth: 0 }}><strong style={{ fontSize: 13 }}>{r.title}</strong>{r.description && <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{r.description}</p>}</div>
        <button type="button" aria-label={actionLabel.replace('+ ', '') + ' ' + r.title} onClick={() => onAction(r.id)} style={{ minHeight: 32, padding: '5px 12px', border: '1px solid var(--line-strong)', borderRadius: 7, background: 'var(--white)', color: 'var(--blue-dark)', fontWeight: 700, fontSize: 12 }}>{actionLabel}</button></li>)}
    </ul>}
    {fallback}
  </div>;
}