import React from 'react';
export function Field({ label, required, hint, error, multiline, value, onChange, placeholder }) {
  const Tag = multiline ? 'textarea' : 'input';
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--ink-soft)' }}>{label}{required && <span style={{ color: 'var(--dec-reject)' }}> *</span>}</span>
      <Tag value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={multiline ? 4 : undefined} aria-invalid={!!error}
        style={{ padding: '9px 12px', minHeight: multiline ? 96 : 38, border: '1px solid ' + (error ? 'var(--dec-reject)' : 'var(--line-strong)'), borderRadius: 6, background: 'var(--white)', fontSize: 14, lineHeight: 1.5, resize: 'vertical' }}/>
      {(error || hint) && <span style={{ fontSize: 12, color: error ? 'var(--dec-reject-fg)' : 'var(--muted)' }}>{error || hint}</span>}
    </label>
  );
}