import { teamLogoOptions, type TeamLogoKey } from './teamApi'

interface Props {
  value: TeamLogoKey
  onChange: (value: TeamLogoKey) => void
  disabled?: boolean
  name?: string
}

export default function TeamLogoPicker({ value, onChange, disabled = false, name = 'team-logo' }: Props) {
  return <fieldset className="team-logo-picker" disabled={disabled}>
    <legend>Team logo <span className="team-optional">(optional)</span></legend>
    <div className="team-logo-options" role="radiogroup" aria-label="Team logo">
      {teamLogoOptions.map(option => <label className={'team-logo-option' + (value === option.key ? ' is-selected' : '')} key={option.key}>
        <input type="radio" name={name} value={option.key} checked={value === option.key} onChange={() => onChange(option.key)} />
        <span className="team-logo-swatch" aria-hidden="true">{option.mark}</span>
        <span>{option.label}</span>
      </label>)}
    </div>
  </fieldset>
}
