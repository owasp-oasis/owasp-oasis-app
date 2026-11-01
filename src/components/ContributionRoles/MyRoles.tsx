import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useWorkspaceData } from '../../pages/workspace/useWorkspaceData'
import { teamPut, errorMessage } from '../../pages/workspace/teamApi'
import type { ContributionRole } from '../../../worker/contributionRoles'
import type { ContributionProfile } from './api'
import RoleChoices from './RoleChoices'
import Assignments from './Assignments'

export function RolePrompt() {
  const { user } = useAuth()
  const { data, loading, error } = useWorkspaceData<{ profile?: ContributionProfile }>(user ? '/api/contribution-roles/mine' : null, {})
  if (!user || loading || error || !data.profile || data.profile.interests_updated_at) return null
  return <section className="ws-card ws-preference-card contribution-prompt"><h2>How would you like to contribute?</h2><p>Choose your role interests, from validating fixes to helping steward a repository.</p><Link className="ws-button ws-button--primary" to="/workspace/preferences#my-roles">Choose my roles</Link></section>
}

export default function MyRoles() {
  const { data, loading, error, retry } = useWorkspaceData<{ profile?: ContributionProfile }>('/api/contribution-roles/mine', {})
  const [draft, setDraft] = useState<ContributionRole[]>([])
  const [saved, setSaved] = useState<ContributionRole[]>([])
  const [otherInterest, setOtherInterest] = useState('')
  const [savedOtherInterest, setSavedOtherInterest] = useState('')
  const [profile, setProfile] = useState<ContributionProfile | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [notice, setNotice] = useState('')
  useEffect(() => { if (data.profile) { setProfile(data.profile); setDraft(data.profile.interests); setSaved(data.profile.interests); setOtherInterest(data.profile.other_interest ?? ''); setSavedOtherInterest(data.profile.other_interest ?? '') } }, [data])
  const dirty = [...draft].sort().join() !== [...saved].sort().join() || otherInterest !== savedOtherInterest
  async function save() {
    setSaving(true); setSaveError(''); setNotice('')
    try {
      const response = await teamPut<{ profile: ContributionProfile }>('/api/contribution-roles/mine', { interests: draft, other_interest: otherInterest })
      setProfile(response.profile); setSaved(response.profile.interests); setDraft(response.profile.interests); setOtherInterest(response.profile.other_interest); setSavedOtherInterest(response.profile.other_interest); setNotice('Role interests saved.')
    } catch (e) { setSaveError(errorMessage(e)) } finally { setSaving(false) }
  }
  if (loading) return <section className="ws-card ws-preference-card" role="status">Loading your roles…</section>
  if (error) return <section className="ws-error" role="alert">{error} <button className="ws-button" onClick={retry}>Retry roles</button></section>
  return <>
    <section id="my-roles" className="ws-card ws-preference-card contribution-section">
      <header><div><h2>My role interests</h2><p>Choose how you’d like to contribute. You can select more than one role.</p></div><span className="contribution-count">{draft.length} selected</span></header>
      <RoleChoices selected={draft} change={next => { setDraft(next); if (!next.includes('other')) setOtherInterest(''); setNotice('') }} otherInterest={otherInterest} changeOtherInterest={value => { setOtherInterest(value); setNotice('') }} disabled={saving} />
      <p className="contribution-help">These express your interest. Confirmed responsibilities appear below.</p>
      {saveError && <p className="ws-error" role="alert">{saveError} Your choices are still here. Try saving again.</p>}
      <div className="contribution-save"><span role="status">{notice || (dirty ? 'You have unsaved role changes.' : 'Choose any roles, or save with none selected for now.')}</span><button className="ws-button ws-button--primary" disabled={saving || (!dirty && !!profile?.interests_updated_at)} onClick={() => void save()}>{saving ? 'Saving…' : 'Save role interests'}</button></div>
    </section>
    <section className="ws-card ws-preference-card contribution-section"><header><div><h2>My assigned roles</h2><p>Confirmed responsibilities for specific repositories.</p></div></header><Assignments assignments={profile?.assignments ?? []} /><p className="contribution-help">Changing your interests doesn’t change an assignment. Contact your project lead to update a responsibility or arrange a handoff.</p></section>
  </>
}
