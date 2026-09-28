import React from 'react';
export function Toast({ message, tone = 'default' }) {
  return <div role="status" style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 60, display: 'flex', alignItems: 'center', gap: 10, padding: '12px 18px', borderRadius: 10, background: 'var(--ink)', color: '#fff', fontSize: 14, boxShadow: 'var(--shadow-strong)' }}>
    {tone === 'success' && <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--green-bright)', boxShadow: 'var(--ring-success)' }}/>}{message}</div>;
}