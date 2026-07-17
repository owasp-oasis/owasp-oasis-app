import { useState } from 'react'
import type { FormEvent } from 'react'
import './RegisterForm.css'

type FormType = 'validator' | 'sponsor'
type FormState = 'idle' | 'loading' | 'success' | 'error'

interface Props {
  type: FormType
  successMessage?: string
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
}: Props) {
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
        body: JSON.stringify({ email: email.trim().toLowerCase(), github: github.trim(), type, role: type }),
      })

      const data = await res.json() as { ok?: boolean; error?: string; message?: string }

      if (res.ok) {
        setState('success')
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
        <p>{successMessage}</p>
      </div>
    )
  }

  return (
    <form className="register-form" onSubmit={handleSubmit} noValidate>
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
        No commitment beyond interest. Your signup puts you at the front of the community.
      </p>
    </form>
  )
}
