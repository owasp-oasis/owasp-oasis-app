import { useState } from 'react'
import type { FormEvent } from 'react'
import './RegisterForm.css'
import RoleChoices from './ContributionRoles/RoleChoices'
import type { ContributionRole } from '../../worker/contributionRoles'

type FormType = 'validator' | 'sponsor'
type FormState = 'idle' | 'loading' | 'success' | 'error'

interface Props {
  type: FormType
  successMessage?: string
  onSuccess?: () => void
}

async function fetchCsrfToken(): Promise<string> {
  try {
    const res = await fetch('/api/csrf', { credentials: 'same-origin' })
    const data = await res.json() as { token?: string }
    return data.token ?? ''
  } catch {
    return ''
  }
}

export default function RegisterForm({
  type,
  successMessage = "You're in. Together we'll secure open source's future.",
  onSuccess,
}: Props) {
  const [interests, setInterests] = useState<ContributionRole[]>([])
  const [otherInterest, setOtherInterest] = useState('')
  const [message, setMessage] = useState('')
  const [interestsSaved, setInterestsSaved] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [github, setGithub] = useState('')
  const [state, setState] = useState<FormState>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setState('loading')
    setErrorMsg('')

    try {
      // Fetch CSRF token + set cookie before posting
      const csrfToken = await fetchCsrfToken()

      const res = await fetch('/api/register', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken,
        },
        body: JSON.stringify({ name: name.trim(), email: email.trim().toLowerCase(), github: github.trim(), type, role: type, interests, other_interest: otherInterest }),
      })

      const data = await res.json() as { ok?: boolean; error?: string; message?: string; role_interests_saved?: boolean }

      if (res.ok) {
        setMessage(data.message ?? successMessage)
        setInterestsSaved(data.role_interests_saved === true)
        setState('success')
        onSuccess?.()
      } else {
        setErrorMsg(data.error ?? 'Something went wrong. Please try again.')
        setState('error')
      }
    } catch {
      setErrorMsg('Network error. Please check your connection and try again.')
      setState('error')
    }
  }

  if (state === 'success') {
    return (
      <div className="register-success">
        <div className="register-success-icon" aria-hidden="true">✓</div>
        <p>{message || successMessage}</p>
        {type === 'validator' && <p>{interestsSaved
          ? 'Your role interests are saved. From the workspace, sign in with GitHub using the same verified email to manage them and carry over these choices.'
          : 'To choose or update your role interests, sign in from the workspace and visit Preferences.'}</p>}
        <a className="btn btn-primary" href="/workspace">Go to Workspace</a>
        <p className="register-success-slack">
          Come introduce yourself on Slack:{' '}
          <a href="https://owasp.slack.com/archives/C0BJACRTT0T" target="_blank" rel="noopener noreferrer">
            Join #oasis
          </a>
        </p>
      </div>
    )
  }

  return (
    <form className="register-form" onSubmit={handleSubmit} noValidate>
      <div className="register-field">
        <label htmlFor={`name-${type}`}>
          Name <span className="required" aria-label="required">*</span>
        </label>
        <input
          id={`name-${type}`}
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="your name"
          required
          maxLength={100}
          autoComplete="name"
          disabled={state === 'loading'}
        />
      </div>

      <div className="register-field">
        <label htmlFor={`email-${type}`}>
          Email address <span className="required" aria-label="required">*</span>
        </label>
        <input
          id={`email-${type}`}
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="you@example.com"
          required
          autoComplete="email"
          disabled={state === 'loading'}
        />
      </div>

      <div className="register-field">
        <label htmlFor={`github-${type}`}>
          GitHub username <span className="optional">(optional)</span>
        </label>
        <input
          id={`github-${type}`}
          type="text"
          value={github}
          onChange={e => setGithub(e.target.value)}
          placeholder="your-github-handle"
          autoComplete="username"
          disabled={state === 'loading'}
        />
      </div>

      {type === 'validator' && <RoleChoices compact selected={interests} change={next => { setInterests(next); if (!next.includes('other')) setOtherInterest('') }} otherInterest={otherInterest} changeOtherInterest={setOtherInterest} disabled={state === 'loading'} />}

      {state === 'error' && (
        <p className="register-error" role="alert">{errorMsg}</p>
      )}

      <button
        type="submit"
        className="btn btn-primary register-submit"
        disabled={state === 'loading'}
      >
        {state === 'loading' ? 'Joining...' : 'Join Team OASIS'}
      </button>

      <p className="register-note">
        No commitment. You'll receive update emails at the address you provide. Thank you for your support.
      </p>
    </form>
  )
}
