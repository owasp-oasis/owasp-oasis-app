import React from 'react';
export function EmptyState({ title, body, action }) {
  return <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '40px 24px', textAlign: 'center', border: '1px dashed var(--line-strong)', borderRadius: 8, background: 'var(--white)' }}>
    <b style={{ fontSize: 16, color: 'var(--ink)' }}>{title}</b>{body && <p style={{ fontSize: 14, color: 'var(--muted)', maxWidth: 420, lineHeight: 1.6 }}>{body}</p>}{action}</div>;
}