import { useEffect, useRef, useState } from 'react'
import { STAR_REPOS, type StarReason, type StarRepoState } from '../../context/StarPromptContext'
import '../VoteModal.css'
import './StarPrompt.css'

const HEADLINES: Record<StarReason, string> = {
  signin: 'Help OASIS grow with a star',
  vote: 'Thanks for your vote!',
  comment: 'Thanks for your comment!',
}

interface Props {
  reason: StarReason
  repos: StarRepoState[] | null
  starring: boolean
  error: string | null
  onStar: () => Promise<boolean>
  onClose: () => void
}

export function StarRepoList({ repos }: { repos: StarRepoState[] | null }) {
  const list = repos ?? STAR_REPOS.map(full_name => ({ full_name, starred: false }))
  return (
    <ul className="sp-repos">
      {list.map(r => (
        <li key={r.full_name}>
          <span className={r.starred ? 'sp-star sp-star--on' : 'sp-star'} aria-hidden="true">{r.starred ? '★' : '☆'}</span>
          <a href={`https://github.com/${r.full_name}`} target="_blank" rel="noopener noreferrer">{r.full_name}</a>
          {r.starred && <span className="sp-starred-label">Starred</span>}
        </li>
      ))}
    </ul>
  )
}

export default function StarPromptModal({ reason, repos, starring, error, onStar, onClose }: Props) {
  const [done, setDone] = useState(false)
  const starButton = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    starButton.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  async function handleStar() {
    if (await onStar()) setDone(true)
  }

  return (
    <div className="vm-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="vm-card sp-card" role="dialog" aria-modal="true" aria-labelledby="sp-title">
        <div className="vm-header">
          <div className="vm-title-row">
            <h2 className="vm-title" id="sp-title">{done ? 'Thank you! ⭐' : HEADLINES[reason]}</h2>
            <button type="button" className="vm-close" onClick={onClose} aria-label="Close">✕</button>
          </div>
        </div>
        <div className="sp-body">
          {done
            ? <p>Both repositories are starred from your GitHub account. Stars help more maintainers and validators find OASIS.</p>
            : <p>Starring the OASIS repositories on GitHub helps more people find the project. Click the button and we'll star these for you from your GitHub account:</p>}
          <StarRepoList repos={repos} />
          {error && <p className="vm-error" role="alert">{error}</p>}
          <div className="vm-footer">
            {done
              ? <button type="button" className="ws-button ws-button--primary" onClick={onClose}>Done</button>
              : <>
                  <button ref={starButton} type="button" className="ws-button ws-button--primary" onClick={handleStar} disabled={starring}>
                    {starring ? 'Starring…' : '⭐ Star on GitHub'}
                  </button>
                  <button type="button" className="ws-button" onClick={onClose}>Not now</button>
                </>}
          </div>
        </div>
      </div>
    </div>
  )
}
