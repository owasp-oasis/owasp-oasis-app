/**
 * Inline star call-to-action shown after mailing-list signup.
 * Signed-in users get the one-click star button; everyone else gets a sign-in
 * link plus direct links to star on GitHub.
 */
import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useStarPrompt } from '../../context/StarPromptContext'
import { StarRepoList } from './StarPromptModal'
import './StarPrompt.css'

export default function StarCallout() {
  const { user } = useAuth()
  const { repos, allStarred, starring, error, starAll } = useStarPrompt()
  const [done, setDone] = useState(false)

  if (user && (allStarred || done)) {
    return <div className="sp-callout"><p><strong>Thanks for starring OASIS! ⭐</strong></p></div>
  }

  return (
    <div className="sp-callout">
      <p><strong>One more way to help:</strong> star the OASIS repositories on GitHub so more people can find the project.</p>
      <StarRepoList repos={user ? repos : null} />
      {error && user && <p className="register-error" role="alert">{error}</p>}
      {user
        ? <button type="button" className="btn btn-primary" disabled={starring} onClick={async () => { if (await starAll()) setDone(true) }}>
            {starring ? 'Starring…' : '⭐ Star on GitHub'}
          </button>
        : <a className="btn btn-primary" href="/api/auth/login">Sign in with GitHub to star</a>}
    </div>
  )
}
