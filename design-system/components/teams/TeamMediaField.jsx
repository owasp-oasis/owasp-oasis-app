import React from 'react';
const D = { logo: ['Custom logo', 'Square PNG, JPEG, or WebP.', 'image/png,image/jpeg,image/webp'], banner: ['Team homepage banner', 'Wide PNG, JPEG, or WebP · up to 768 KB', 'image/png,image/jpeg,image/webp'] };
export function TeamMediaField({ kind, preview, note, onChoose, onRemove, error, disabled }) {
  const ref = React.useRef(null);
  const [label, help, accept] = D[kind];
  const box = kind === 'logo' ? { width: 88, height: 88, borderRadius: 14 } : { width: 200, height: 84, borderRadius: 8 };
  return <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', padding: 12, border: '1px solid var(--line)', borderRadius: 8, background: 'var(--gray-100)' }}>
    <div aria-hidden="true" style={{ ...box, flex: 'none', overflow: 'hidden', background: 'var(--blue-soft)', display: 'grid', placeItems: 'center', color: 'var(--blue-dark)', fontSize: 12, fontWeight: 600 }}>{preview ? <img src={preview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : kind === 'logo' ? 'Logo' : 'Banner'}</div>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 200 }}>
      <strong style={{ fontSize: 13 }}>{label}</strong><span style={{ fontSize: 12, color: 'var(--muted)' }}>{help}</span>{note && <span style={{ fontSize: 12, color: 'var(--muted)' }}>{note}</span>}
      {error && <span role="alert" style={{ fontSize: 12, color: 'var(--dec-reject-fg)' }}>{error}</span>}
      <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
        <button type="button" disabled={disabled} onClick={() => ref.current && ref.current.click()} style={{ minHeight: 34, padding: '6px 12px', border: '1px solid var(--line-strong)', borderRadius: 7, background: 'var(--white)', color: 'var(--blue-dark)', fontWeight: 700, fontSize: 13 }}>{preview ? 'Replace' : 'Choose image'}</button>
        {preview && onRemove && <button type="button" disabled={disabled} onClick={onRemove} style={{ border: 0, background: 'none', color: 'var(--blue)', fontSize: 13 }}>Remove</button>}
      </div>
    </div>
    <input ref={ref} type="file" accept={accept} aria-label={label} disabled={disabled} onChange={e => { const f = e.target.files && e.target.files[0]; if (f) onChoose(f); e.target.value = ''; }} style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }} />
  </div>;
}