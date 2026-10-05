import React from 'react';
export function ConfirmDialog({ open, title, explanation, confirmLabel, danger, busy, onConfirm, onCancel }) {
  const cancel = React.useRef(null);
  React.useEffect(() => { if (open && cancel.current) cancel.current.focus(); }, [open]);
  React.useEffect(() => { if (!open) return; const k = e => { if (e.key === 'Escape' && !busy) onCancel(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [open, busy, onCancel]);
  if (!open) return null;
  return <>
    <div onClick={busy ? undefined : onCancel} style={{ position: 'fixed', inset: 0, background: 'rgba(7,17,31,.4)', zIndex: 90 }} />
    <div role="dialog" aria-modal="true" aria-labelledby="confirm-title" style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 91, width: 'min(460px, calc(100vw - 32px))', padding: 26, background: 'var(--white)', border: '1px solid var(--line)', borderRadius: 10, boxShadow: 'var(--shadow-strong)', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <h3 id="confirm-title" style={{ fontSize: 18, fontWeight: 700 }}>{title}</h3>
      <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--ink-soft)' }}>{explanation}</p>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
        <button ref={cancel} disabled={busy} onClick={onCancel} style={{ minHeight: 38, padding: '8px 16px', border: '1px solid var(--line-strong)', borderRadius: 8, background: 'var(--white)', color: 'var(--blue-dark)', fontWeight: 700, fontSize: 14 }}>Cancel</button>
        <button disabled={busy} onClick={onConfirm} style={{ minHeight: 38, padding: '8px 16px', border: 0, borderRadius: 8, background: danger ? 'var(--dec-reject)' : 'var(--green-bright)', color: danger ? 'var(--white)' : 'var(--blue-dark)', fontWeight: 700, fontSize: 14 }}>{busy ? 'Saving…' : confirmLabel}</button>
      </div>
    </div>
  </>;
}