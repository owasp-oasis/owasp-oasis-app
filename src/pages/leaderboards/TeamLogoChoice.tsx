import type { ReactNode } from 'react'

export type LogoSource = 'builtin' | 'custom'

interface Props {
  value: LogoSource
  onChange: (value: LogoSource) => void
  disabled?: boolean
  name: string
  builtin: ReactNode
  custom: ReactNode
}

export default function TeamLogoChoice({ value, onChange, disabled, name, builtin, custom }: Props) {
  return <fieldset className="team-logo-choice" disabled={disabled}>
    <legend>Team logo</legend>
    <div className="team-logo-source" role="radiogroup" aria-label="Logo source">
      <label><input type="radio" name={name} checked={value === 'builtin'} onChange={() => onChange('builtin')} />Choose an icon</label>
      <label><input type="radio" name={name} checked={value === 'custom'} onChange={() => onChange('custom')} />Custom image</label>
    </div>
    {value === 'builtin' ? builtin : custom}
  </fieldset>
}
