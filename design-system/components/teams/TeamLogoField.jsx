import React from 'react';
const OPTS = [['initials','Initials','Aa'],['shield','Shield','◇'],['bug','Bug','✣'],['lock','Lock','▣'],['spark','Spark','✦'],['code','Code','</>'],['leaf','Leaf','⌁']];
export function TeamLogoField({ source, onSourceChange, logoKey, onLogoKeyChange, custom, disabled, name }) {
  const lbl = { fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--ink-soft)', marginBottom: 10 };
  return <fieldset disabled={disabled} style={{ border: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
    <legend style={lbl}>Team logo</legend>
    <div role="radiogroup" aria-label="Logo source" style={{ display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: 13 }}>
      {[['builtin', 'Choose an icon'], ['custom', 'Custom image']].map(([v, l]) => <label key={v} style={{ display: 'flex', alignItems: 'center', gap: 7 }}><input type="radio" name={name} checked={source === v} onChange={() => onSourceChange(v)} style={{ accentColor: 'var(--green)' }} /> {l}</label>)}
    </div>
    {source === 'builtin' ? <div role="radiogroup" aria-label="Team logo" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {OPTS.map(([k, l, m]) => { const on = k === logoKey; return <button key={k} type="button" role="radio" aria-checked={on} onClick={() => onLogoKeyChange(k)} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 9px', border: '1px solid ' + (on ? 'var(--green)' : 'var(--line-strong)'), borderRadius: 7, background: on ? 'var(--green-soft)' : 'var(--white)', color: on ? 'var(--green-ink)' : 'var(--ink-soft)', fontSize: 12, fontWeight: 600 }}>
        <span aria-hidden="true" style={{ width: 30, height: 30, borderRadius: 8, background: on ? 'var(--green)' : 'var(--blue-soft)', color: on ? 'var(--white)' : 'var(--blue-dark)', display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 700 }}>{m}</span>{l}</button>; })}
    </div> : custom}
  </fieldset>;
}