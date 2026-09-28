import React from 'react';
export function DonorLogo({ name, src, plate = '#fff', height = 20 }) {
  return <span title={'Tooling donated by ' + name} style={{ display: 'inline-flex', alignItems: 'center', height: height + 12, padding: '6px 10px', background: plate, border: '1px solid var(--line)', borderRadius: 6 }}><img src={src} alt={name} style={{ height, width: 'auto', maxWidth: 120 }}/></span>;
}