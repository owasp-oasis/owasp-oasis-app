import { useState, type FormEvent } from 'react'
import { useAuth } from '../../context/AuthContext'
import './teams.css'

interface Team {
  id: number
  name: string
  description: string
  status: 'active' | 'archived' | 'suspended'
  member_count: number
  attributed_validations: number
  accepted_outcome_reviews: number
  active_contributors?: number
  validations_per_active_contributor?: number
}

interface Props {
  data: Team[]
  loading: boolean
  onCreated: () => void
}

async function csrfPost(path: string, body: unknown): Promise<Response> {
  const csrf = await fetch('/api/csrf', { credentials: 'include' })
  if (!csrf.ok) throw new Error('Could not start a secure request. Please try again.')
  const { token } = await csrf.json() as { token: string }
  return fetch(path, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json', 'x-csrf-token': token },
    body: JSON.stringify(body),
  })
}

export default function TeamsTab({ data, loading, onCreated }: Props) {
  const { user, loading: authLoading } = useAuth()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [membershipMode, setMembershipMode] = useState<'invite_only' | 'request'>('invite_only')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [createdName, setCreatedName] = useState<string | null>(null)

  const createTeam = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setFormError(null)
    setCreatedName(null)
    setSubmitting(true)
    try {
      const response = await csrfPost('/api/teams', { name, description, membership_mode: membershipMode })
      const result = await response.json() as { error?: string }
      if (!response.ok) throw new Error(result.error ?? 'Could not create the Team')
      setCreatedName(name.trim())
      setName('')
      setDescription('')
      setMembershipMode('invite_only')
      onCreated()
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Could not create the Team')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <div className="tab-loading">Loading Teams…</div>

  const ordered = [...data].sort((a, b) =>
    b.accepted_outcome_reviews - a.accepted_outcome_reviews ||
    b.attributed_validations - a.attributed_validations ||
    a.name.localeCompare(b.name),
  )

  return (
    <div className="teams-tab">
      <section className="teams-intro">
        <div>
          <span className="teams-kicker">Community collaboration</span>
          <h2>Teams</h2>
          <p>
            Work with fellow OASIS members while keeping each person’s validation activity their own.
            A submission can optionally credit one Team, and Team totals are public.
          </p>
        </div>
        <div className="teams-privacy-note">
          <strong>Private by default</strong>
          <span>Membership, member activity, and invitations are visible only to current Team members.</span>
        </div>
      </section>

      {!authLoading && user && (
        <section className="team-create-card" aria-labelledby="team-create-heading">
          <div>
            <h3 id="team-create-heading">Start a Team</h3>
            <p>Any signed-in OASIS member can create a Team.</p>
          </div>
          <form onSubmit={createTeam} className="team-create-form">
            <label>
              Team name
              <input value={name} onChange={event => setName(event.target.value)} maxLength={80} required />
            </label>
            <label>
              Short description <span className="teams-optional">optional</span>
              <input value={description} onChange={event => setDescription(event.target.value)} maxLength={500} />
            </label>
            <label>
              Membership
              <select value={membershipMode} onChange={event => setMembershipMode(event.target.value as 'invite_only' | 'request')}>
                <option value="invite_only">Invite only</option>
                <option value="request">Open to join requests</option>
              </select>
            </label>
            <button className="btn btn-secondary" type="submit" disabled={submitting}>
              {submitting ? 'Creating…' : 'Create Team'}
            </button>
          </form>
          {formError && <p className="teams-form-error" role="alert">{formError}</p>}
          {createdName && <p className="teams-form-success" role="status">{createdName} is ready. You are its owner.</p>}
        </section>
      )}

      {!authLoading && !user && (
        <p className="tab-note">Sign in with GitHub to start a Team or take part in one.</p>
      )}

      <section aria-labelledby="team-ranking-heading">
        <div className="teams-section-heading">
          <div>
            <h3 id="team-ranking-heading">All-time achievement</h3>
            <p>Ranked by reviews on pull requests later accepted upstream; validation count breaks ties.</p>
          </div>
          <span className="teams-window">Also tracked: 90-day activity</span>
        </div>

        {ordered.length === 0 ? (
          <div className="tab-empty">No Teams yet. Start the first one.</div>
        ) : (
          <ol className="teams-ranking">
            {ordered.map((team, index) => (
              <li key={team.id} className="team-ranking-row">
                <span className="team-rank">{index + 1}</span>
                <div className="team-ranking-name">
                  <strong>{team.name}</strong>
                  {team.description && <span>{team.description}</span>}
                  {team.status !== 'active' && <em>{team.status}</em>}
                </div>
                <dl className="team-stats">
                  <div><dt>Accepted outcomes</dt><dd>{team.accepted_outcome_reviews}</dd></div>
                  <div><dt>Validations</dt><dd>{team.attributed_validations}</dd></div>
                  <div><dt>Members</dt><dd>{team.member_count}</dd></div>
                </dl>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  )
}
