import { useState } from 'react'
import { SIGNUP_ROLE_CHOICES, type SignupRoleChoice } from './roles'
import './ContributionRoles.css'
export default function RoleChoices({ disabled = false }: { disabled?: boolean }) {
  const [selected, setSelected] = useState<SignupRoleChoice[]>([])
  const [otherInterest, setOtherInterest] = useState('')
  const choices = (items: readonly typeof SIGNUP_ROLE_CHOICES[number][]) => items.map(role => <label key={role.id} className="contribution-signup-choice">
    <input value={role.id} type="checkbox" checked={selected.includes(role.id)} onChange={event => {
      const next = selected.includes(role.id) ? selected.filter(id => id !== role.id) : [...selected, role.id]
      setSelected(next)
      if (role.id === 'other' && !event.currentTarget.checked) setOtherInterest('')
    }} />
    <span><b>{role.name}</b><small>{role.description}</small></span>
  </label>)
  const otherField = selected.includes('other') && <label className="contribution-other-interest">
    <span>Your idea <span className="optional">(required)</span></span>
    <textarea value={otherInterest} maxLength={240} rows={2} required onChange={event => setOtherInterest(event.target.value)} placeholder="What would you like to help with?" />
  </label>
  return <fieldset disabled={disabled} className="contribution-signup-roles">
    <legend>How would you like to help? <span className="optional">(optional)</span></legend>
    <p>Choose any roles that interest you.</p>
    {choices(SIGNUP_ROLE_CHOICES.slice(0, 3))}
    <details><summary>More ways to contribute{selected.filter(id => SIGNUP_ROLE_CHOICES.slice(3).some(role => role.id === id)).length > 0 ? ' · ' + selected.filter(id => SIGNUP_ROLE_CHOICES.slice(3).some(role => role.id === id)).length + ' selected' : ''}</summary>{choices(SIGNUP_ROLE_CHOICES.slice(3))}</details>
    {otherField}
    <p className="contribution-help">These selections show your interests and do not assign repository responsibility.</p>
  </fieldset>
}
