import { CONTRIBUTION_ROLES, type ContributionRole } from '../../../worker/contributionRoles'
import './ContributionRoles.css'
export default function RoleChoices({ selected, change, otherInterest = '', changeOtherInterest, compact = false, disabled = false }: { selected: ContributionRole[]; change: (roles: ContributionRole[]) => void; otherInterest?: string; changeOtherInterest?: (value: string) => void; compact?: boolean; disabled?: boolean }) {
  const choices = (items: readonly typeof CONTRIBUTION_ROLES[number][]) => items.map(role => <label key={role.id} className={compact ? 'contribution-signup-choice' : 'ws-choice-tile'}>
    <input type="checkbox" checked={selected.includes(role.id)} onChange={() => change(selected.includes(role.id) ? selected.filter(id => id !== role.id) : [...selected, role.id])} />
    <span><b>{role.name}</b><small>{role.description}</small></span>
  </label>)
  const otherField = selected.includes('other') && <label className={compact ? 'contribution-other-interest compact' : 'contribution-other-interest'}>
    <span>Your idea <span className="optional">(required)</span></span>
    <textarea value={otherInterest} maxLength={240} rows={compact ? 2 : 3} required onChange={event => changeOtherInterest?.(event.target.value)} placeholder="What would you like to help with?" />
  </label>
  return compact ? <fieldset disabled={disabled} className="contribution-signup-roles">
    <legend>How would you like to help? <span className="optional">(optional)</span></legend>
    <p>Choose any roles that interest you.</p>
    {choices(CONTRIBUTION_ROLES.slice(0, 3))}
    <details><summary>More ways to contribute{selected.filter(id => CONTRIBUTION_ROLES.slice(3).some(role => role.id === id)).length > 0 ? ' · ' + selected.filter(id => CONTRIBUTION_ROLES.slice(3).some(role => role.id === id)).length + ' selected' : ''}</summary>{choices(CONTRIBUTION_ROLES.slice(3))}</details>
    {otherField}
    <p className="contribution-help">You can update these later in Preferences. Repository assignments are confirmed separately.</p>
  </fieldset> : <fieldset disabled={disabled}><legend className="contribution-sr">My role interests</legend><div className="ws-choice-list contribution-choices">{choices(CONTRIBUTION_ROLES)}</div>{otherField}</fieldset>
}
