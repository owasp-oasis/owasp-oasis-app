import React from 'react';
export function Avatar({ login, size = 28, src }) {
  const [err, setErr] = React.useState(false);
  const init = login.replace(/[^a-z0-9]/gi, '').slice(0, 2).toUpperCase();
  const url = src || `https://github.com/${login}.png?size=${size * 2}`;
  return (
    <span style={{ position: 'relative', width: size, height: size, borderRadius: '50%', background: 'var(--blue-dark)', color: '#fff', display: 'inline-grid', placeItems: 'center', fontSize: Math.round(size * .36), fontWeight: 700, overflow: 'hidden', flex: 'none', border: '2px solid var(--blue-soft)' }}>
      {init}{!err && <img src={url} alt="" onError={() => setErr(true)} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
    </span>
  );
}