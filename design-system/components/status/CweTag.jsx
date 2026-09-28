import React from 'react';
export function CweTag({ id, name }) {
  return <span style={{ display: 'inline-flex', gap: 6, alignItems: 'baseline', fontSize: 13, color: 'var(--ink-soft)' }}><span style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 600, color: 'var(--ink)' }}>{id}</span>{name && <span>{name}</span>}</span>;
}