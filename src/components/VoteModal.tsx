/**
 * VoteModal — overlay wrapper around VoteForm.
 * Kept for any future standalone use; PRPanel uses VoteForm directly.
 */
import { useEffect, useRef } from 'react'
import VoteForm, { type Decision, type VoteFormPR } from './VoteForm'
import './VoteModal.css'

interface Props {
  pr: VoteFormPR
  initialDecision?: Decision
  onClose: () => void
  onSuccess: (decision: Decision) => void
}

export default function VoteModal({ pr, initialDecision = 'accept', onClose, onSuccess }: Props) {
  const overlayRef = useRef<HTMLDivElement>(null)

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  function handleOverlayClick(e: React.MouseEvent) {
    if (e.target === overlayRef.current) onClose()
  }

  return (
    <div
      className="vm-overlay"
      ref={overlayRef}
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-label={`Vote on PR #${pr.number}`}
    >
      <div className="vm-card">
        <div className="vm-header">
          <div className="vm-title-row">
            <h2 className="vm-title">Cast your OASIS vote</h2>
            <button className="vm-close" onClick={onClose} aria-label="Close">✕</button>
          </div>
          <p className="vm-pr-label">
            <span className="vm-repo">{pr.repo_name}</span>
            {' — '}
            <a
              href={`https://github.com/owasp-oasis/${pr.repo_name}/pull/${pr.number}`}
              target="_blank"
              rel="noopener noreferrer"
              className="vm-pr-link"
            >
              #{pr.number} {pr.title.length > 60 ? pr.title.slice(0, 60) + '…' : pr.title}
            </a>
          </p>
        </div>
        <VoteForm
          pr={pr}
          initialDecision={initialDecision}
          onClose={onClose}
          onSuccess={onSuccess}
        />
      </div>
    </div>
  )
}
