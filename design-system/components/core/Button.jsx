import React from 'react';
const V = {
  primary: { background: 'var(--green-bright)', color: 'var(--blue-dark)', border: '1px solid transparent' },
  secondary: { background: 'var(--blue)', color: 'var(--white)', border: '1px solid transparent', boxShadow: 'var(--shadow-btn-blue)' },
  outline: { background: 'transparent', color: 'var(--blue)', border: '2px solid var(--blue)' },
  quiet: { background: 'var(--white)', color: 'var(--blue-dark)', border: '1px solid var(--line-strong)' },
  'ghost-light': { background: 'transparent', color: 'var(--white)', border: '2px solid rgba(255,255,255,.5)' },
};
export function Button({ variant = 'primary', size = 'lg', iconRight, disabled, onClick, children }) {
  const [h, setH] = React.useState(false);
  const s = size === 'lg' ? { minHeight: 42, padding: '10px 20px', fontSize: 16 } : { minHeight: 38, padding: '8px 16px', fontSize: 14 };
  return (
    <button disabled={disabled} onClick={onClick} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 8, fontFamily: 'var(--sans)', fontWeight: 700, whiteSpace: 'nowrap', cursor: disabled ? 'not-allowed' : 'pointer', transition: 'transform var(--dur), box-shadow var(--dur), background var(--dur), opacity var(--dur)', ...V[variant], ...s, opacity: disabled ? .45 : h ? .9 : 1, transform: h && !disabled ? 'translateY(-1px)' : 'none' }}>
      {children}{iconRight}
    </button>
  );
}