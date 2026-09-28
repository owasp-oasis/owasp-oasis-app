import React from 'react';
export function ResponseBadgeCard({ name, kind, earned, description, criteria, clockNote }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 18, background: '#fff', border: '1px solid ' + (earned ? 'rgba(13,158,82,.35)' : 'var(--line)'), borderRadius: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ width: 36, height: 36, borderRadius: 8, display: 'grid', placeItems: 'center', background: earned ? 'var(--green-soft)' : 'var(--gray-100)', color: earned ? 'var(--green)' : 'var(--gray-400)' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="6"/><path d="M15.5 13 17 22l-5-3-5 3 1.5-9"/></svg></span>
        <div style={{ display: 'flex', flexDirection: 'column' }}><b style={{ fontSize: 15 }}>{name}</b><span style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--muted)' }}>{kind}</span></div>
        <span style={{ marginLeft: 'auto', padding: '2px 8px', borderRadius: 100, fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', background: earned ? 'var(--green-soft)' : 'var(--gray-100)', color: earned ? 'var(--green-ink)' : 'var(--gray-600)' }}>{earned ? 'Earned' : 'Not yet earned'}</span>
      </div>
      <p style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--ink-soft)' }}>{description}</p>
      {criteria.map(c => { const p = Math.min(100, c.value / c.target * 100); return (
        <div key={c.label} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--ink-soft)' }}><span>{c.label}</span><span style={{ fontFamily: 'var(--mono)' }}>{c.value}{c.unit || ''} / {c.target}{c.unit || ''}</span></div>
          <div style={{ height: 6, borderRadius: 100, background: 'var(--gray-200)' }}><div style={{ width: p + '%', height: '100%', borderRadius: 100, background: p >= 100 ? 'var(--green)' : 'var(--blue)' }}/></div>
        </div> ); })}
      {clockNote && <p style={{ fontSize: 12, color: 'var(--muted)' }}>{clockNote}</p>}
    </div>
  );
}