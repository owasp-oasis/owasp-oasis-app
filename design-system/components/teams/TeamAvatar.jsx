import React from 'react';
const MARKS = { shield: '◇', bug: '✣', lock: '▣', spark: '✦', code: '</>', leaf: '⌁' };
const SIZES = { list: [44, 11, 14], leaderboard: [34, 9, 12], header: [58, 14, 19] };
const init = (n) => n.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
export function TeamAvatar({ name, logoKey = 'initials', imageSrc, size = 'list' }) {
  const [failed, setFailed] = React.useState(false);
  const [px, r, fs] = SIZES[size];
  const mark = MARKS[logoKey];
  return <span aria-hidden="true" style={{ width: px, height: px, flex: 'none', borderRadius: r, background: 'var(--blue-soft)', color: 'var(--blue-dark)', display: 'grid', placeItems: 'center', fontSize: fs, fontWeight: 700, overflow: 'hidden' }}>
    {imageSrc && !failed ? <img src={imageSrc} alt="" onError={() => setFailed(true)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : mark || init(name)}
  </span>;
}