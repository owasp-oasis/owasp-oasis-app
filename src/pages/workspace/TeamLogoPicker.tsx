import { teamLogoOptions, type TeamLogoKey } from './teamApi'
import TeamLogoIcon from './TeamLogoIcon'

interface Props {
  value: TeamLogoKey
  onChange: (value: TeamLogoKey) => void
  disabled?: boolean
  name?: string
}

export default function TeamLogoPicker({ value, onChange, disabled = false, name = 'team-logo' }: Props) {
  return <fieldset className="team-logo-picker" disabled={disabled}>
    <legend className="team-sr-only">Built-in logo</legend>
    <div className="team-logo-options" role="radiogroup" aria-label="Team logo">
      {teamLogoOptions.map(option => <label className={'team-logo-option' + (value === option.key ? ' is-selected' : '')} key={option.key}>
        <input type="radio" name={name} value={option.key} checked={value === option.key} onChange={() => onChange(option.key)} />
        <span className="team-logo-swatch" aria-hidden="true">{option.key === 'initials' ? 'Aa' : <TeamLogoIcon logo={option.key} size={21} />}</span>
        <span>{option.label}</span>
      </label>)}
    </div>
  </fieldset>
}
