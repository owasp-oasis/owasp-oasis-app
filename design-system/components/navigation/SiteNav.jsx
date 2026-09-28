import React from 'react';
import { Avatar } from '../core/Avatar.jsx';
const LINKS = ['Home', 'About', 'Overview', 'Workspace', 'Support', 'Sponsors', 'News & Events'];
export function SiteNav({ active = 'Workspace', user, onAccount }) {
  return (
    <header style={{ position: 'sticky', top: 0, zIndex: 100, height: 64, background: 'var(--nav-bg)', backdropFilter: 'var(--blur-nav)', borderBottom: '1px solid var(--line)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 32, height: '100%', padding: '0 24px', maxWidth: 1440, margin: '0 auto' }}>
        <img src="assets/logo/oasis-wordmark.svg" alt="OASIS" style={{ height: 36 }}/>
        <nav style={{ display: 'flex', gap: 4, flex: 1, minWidth: 0 }}>
          {LINKS.map(l => <a key={l} href="#" style={{ padding: '6px 14px', borderRadius: 6, fontSize: 15, fontWeight: l === active ? 600 : 500, color: l === active ? 'var(--blue-dark)' : 'var(--gray-600)', background: l === active ? 'var(--blue-soft)' : 'transparent', whiteSpace: 'nowrap', textDecoration: 'none' }}>{l}</a>)}
        </nav>
        {user ? <button onClick={onAccount} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 38, padding: '4px 9px 4px 5px', borderRadius: 999, border: '1px solid var(--line)', background: 'rgba(255,255,255,.72)', boxShadow: 'var(--shadow-pill)', color: 'var(--blue-dark)', fontSize: 14, fontWeight: 600 }}><Avatar login={user.login}/>@{user.login}</button>
          : <div style={{ display: 'flex', gap: 12 }}><a href="#" style={{ fontSize: 14, fontWeight: 600, color: 'var(--blue-dark)', border: '1px solid var(--gray-200)', borderRadius: 6, padding: '5px 12px' }}>Sign in</a><a href="#" style={{ padding: '8px 20px', borderRadius: 8, background: 'var(--blue)', color: '#fff', fontSize: 14, fontWeight: 700 }}>Join Team OASIS</a></div>}
      </div>
    </header>
  );
}