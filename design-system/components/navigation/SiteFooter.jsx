import React from 'react';
const L = ['Home', 'About', 'Overview', 'Workspace', 'Sponsors', 'News & Events', 'Brand Guide'];
export function SiteFooter({ version = 'v2026.07.005' }) {
  const a = { color: 'var(--gray-400)', fontSize: 14.4, textDecoration: 'none' };
  return (
    <footer style={{ background: 'var(--gray-800)', color: 'var(--gray-400)' }}>
      <div style={{ maxWidth: 1080, margin: '0 auto', padding: '48px 24px', display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 48 }}>
        <div><span style={{ display: 'inline-block', background: '#fff', borderRadius: 8, padding: '8px 14px', marginBottom: 16 }}><img src="assets/logo/oasis-wordmark.svg" alt="OASIS" style={{ height: 28 }}/></span>
          <p style={{ fontSize: 14, lineHeight: 1.8 }}>Open source powers the world.<br/>Vibe hacking exploits it.<br/>Team OASIS fixes it.</p></div>
        <nav style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{L.map(l => <a key={l} href="#" style={a}>{l}</a>)}</nav>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{['GitHub', 'OWASP', 'Slack'].map(l => <a key={l} href="#" style={a}>{l}</a>)}</div>
      </div>
      <div style={{ borderTop: '1px solid rgba(255,255,255,.08)', padding: '16px 0' }}><div style={{ maxWidth: 1080, margin: '0 auto', padding: '0 24px', display: 'flex', justifyContent: 'space-between', fontSize: 13, opacity: .7 }}>
        <span>OASIS | Official OWASP project © 2026</span><span>Vendor-neutral. Community-driven. Open source.</span><span>{version}</span></div></div>
    </footer>
  );
}