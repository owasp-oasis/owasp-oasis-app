import { Link } from 'react-router-dom'
import { Users, X } from 'lucide-react'
import { useMyTeams } from '../context/MyTeamsContext'
import './TeamInvitationNotice.css'

export default function TeamInvitationNotice() {
  const { mine, dismissed, dismiss } = useMyTeams()
  const count = mine.invites.length
  return <div role="status" aria-live="polite" aria-atomic="true">
    {count > 0 && !dismissed && <section className="team-invitation-notice" aria-label="Pending Team invitations">
      <Users size={20} aria-hidden="true" />
      <p>You have <strong>{count} pending Team {count === 1 ? 'invitation' : 'invitations'}</strong>.</p>
      <Link to="/workspace/teams?view=mine&invitations=1">View invitations</Link>
      <button type="button" onClick={dismiss} aria-label="Dismiss Team invitation notification"><X size={18} aria-hidden="true" /></button>
    </section>}
  </div>
}
