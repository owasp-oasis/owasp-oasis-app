import React from 'react';
export function StatBlock({ items, tone = 'light', direction = 'row' }) {
  const dark = tone === 'dark';
  if (direction === 'stack') return (
    <div style={{ display: 'flex', flexDirection: 'column', padding: '6px 16px', borderRadius: 10, background: dark ? 'rgba(11,79,138,.55)' : 'var(--white)', border: dark ? 0 : '1px solid var(--line)', minWidth: 200 }}>
      {items.map((it, i) => <div key={it.label} style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 20, padding: '6px 0', borderBottom: i < items.length - 1 ? '1px solid ' + (dark ? 'rgba(255,255,255,.18)' : 'var(--gray-200)') : 0 }}>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', color: dark ? 'var(--blue-soft)' : 'var(--muted)' }}>{it.label}</span>
        <span style={{ fontSize: 18, fontWeight: 700, color: dark ? '#fff' : 'var(--ink)' }}>{it.value}</span></div>)}
    </div>);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${items.length}, minmax(0,1fr))`, gap: 1, background: 'var(--line)', border: '1px solid var(--line)', borderRadius: 10, overflow: 'hidden' }}>
      {items.map(it => <div key={it.label} style={{ background: 'rgba(255,255,255,.78)', padding: 18 }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--ink)' }}>{it.value}</div>
        <div style={{ marginTop: 4, fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--muted)' }}>{it.label}</div></div>)}
    </div>);
}