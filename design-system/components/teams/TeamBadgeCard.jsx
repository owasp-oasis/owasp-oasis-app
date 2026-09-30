import React from 'react';
export function TeamBadgeCard({ kind, earned, threshold, earnedThreshold, progress = 0 }) {
  const member = kind === 'membership';
  const bar = earned ? (earnedThreshold ?? threshold) : threshold;
  const pct = Math.min(100, progress / threshold * 100);
  return <li style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10, padding: 14, border: '1px solid ' + (earned ? 'rgba(13,158,82,.35)' : 'var(--line)'), borderRadius: 8, background: earned ? '#f5faf7' : 'var(--white)' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span aria-hidden="true" style={{ width: 34, height: 34, borderRadius: '50%', display: 'grid', placeItems: 'center', background: earned ? 'var(--green-soft)' : 'var(--gray-100)', color: earned ? 'var(--green)' : 'var(--gray-400)' }}>{member ? '◎' : '✦'}</span>
      <div style={{ flex: 1 }}><strong style={{ fontSize: 14 }}>{member ? 'Team member' : 'Team contributor'}</strong><p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{member ? 'Membership badge' : bar + ' attributed validations'}</p></div>
      <span style={{ padding: '2px 8px', borderRadius: 100, fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', background: earned ? 'var(--green-soft)' : 'var(--gray-100)', color: earned ? 'var(--green-ink)' : 'var(--gray-600)' }}>{earned ? 'Earned' : 'In progress'}</span>
    </div>
    {!earned && <div role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={threshold} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}><div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}><span>Attributed validations</span><span style={{ fontFamily: 'var(--mono)' }}>{progress} / {threshold}</span></div><div style={{ height: 6, borderRadius: 100, background: 'var(--gray-200)' }}><div style={{ width: pct + '%', height: '100%', borderRadius: 100, background: 'var(--blue)' }} /></div></div>}
    {earned && earnedThreshold && earnedThreshold !== threshold && <p style={{ fontSize: 12, color: 'var(--muted)' }}>Earned at the {earnedThreshold}-validation bar. The Team now uses {threshold}; earned badges are never revoked.</p>}
  </li>;
}