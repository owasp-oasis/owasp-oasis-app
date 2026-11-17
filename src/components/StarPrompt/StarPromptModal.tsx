import { useEffect, useRef, useState } from 'react'
import { STAR_REPOS } from '../../../worker/starRepos'
import type { StarReason, StarRepoState } from '../../context/StarPromptContext'
import '../VoteModal.css'
import './StarPrompt.css'

const HEADLINES: Record<StarReason, string> = {
  signin: 'Help OASIS grow with a star',
  vote: 'Thanks for your vote!',
  comment: 'Thanks for your comment!',
}

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

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
  const dialogRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  // Focus the primary action on open and hand focus back on close.
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    starButton.current?.focus()
    return () => { if (previous?.isConnected) previous.focus() }
  }, [])

  // The page behind (PR panel, candidate list) listens for Escape and arrow
  // keys on `document`. Handle keys on `window` in the capture phase so this
  // dialog owns them: Escape closes only this popup, Tab stays inside it, and
  // nothing reaches the page's shortcuts while it is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const dialog = dialogRef.current
      if (!dialog) return
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onCloseRef.current()
        return
      }
      if (e.key === 'Tab') {
        const nodes = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE))
        const first = nodes[0]
        const last = nodes[nodes.length - 1]
        const active = document.activeElement
        if (!dialog.contains(active)) { e.preventDefault(); first?.focus() }
        else if (e.shiftKey && active === first) { e.preventDefault(); last?.focus() }
        else if (!e.shiftKey && active === last) { e.preventDefault(); first?.focus() }
      }
      e.stopPropagation()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  async function handleStar() {
    if (await onStar()) setDone(true)
  }

  return (
    <div className="vm-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div ref={dialogRef} className="vm-card sp-card" role="dialog" aria-modal="true" aria-labelledby="sp-title">
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
