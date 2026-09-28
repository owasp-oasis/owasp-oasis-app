import React from 'react';
export function Card({ padding = 22, elevated, selected, children }) {
  return <div style={{ background: selected ? 'var(--blue-soft)' : 'var(--white)', border: '1px solid ' + (selected ? 'var(--line-strong)' : 'var(--line)'), borderRadius: 8, padding, boxShadow: elevated ? 'var(--shadow)' : 'none' }}>{children}</div>;
}