import React from 'react';
const T = { blue: 'var(--blue)', green: 'var(--green-bright)', light: 'rgba(255,255,255,.65)', muted: 'var(--muted)' };
export function Eyebrow({ tone = 'blue', children }) {
  return <span style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', color: T[tone] }}>{children}</span>;
}