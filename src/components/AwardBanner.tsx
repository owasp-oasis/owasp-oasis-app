import { useEffect, useState } from 'react'
import { isSansVotingOpen, SANS_VOTING_END } from '../lib/sansVoting'
import './AwardBanner.css'

const AWARD_ALERT_KEY = 'oasis-alert:sans-2026-finalist'

function isDismissed(): boolean {
  try {
    return window.localStorage.getItem(AWARD_ALERT_KEY) === 'dismissed'
  } catch {
    return false
  }
}

export default function AwardBanner() {
  const [dismissed, setDismissed] = useState(isDismissed)
  const [votingOpen, setVotingOpen] = useState(isSansVotingOpen)

  useEffect(() => {
    if (!votingOpen) return
    const timeout = window.setTimeout(() => setVotingOpen(false), SANS_VOTING_END - Date.now())
    return () => window.clearTimeout(timeout)
  }, [votingOpen])

  if (dismissed || !votingOpen) return null

  function dismiss() {
    setDismissed(true)
    try {
      window.localStorage.setItem(AWARD_ALERT_KEY, 'dismissed')
    } catch { /* The banner still closes if storage is unavailable. */ }
  }

  return (
    <aside className="award-banner" aria-label="SANS Difference Makers Awards announcement">
      <div className="award-banner-inner">
        <span className="award-banner-label">Community vote</span>
        <div className="award-banner-message">
          <strong>OWASP OASIS is a 2026 SANS Difference Makers Awards finalist.</strong>
          <span className="award-banner-deadline">Voting closes November 9th</span>
        </div>
        <a className="award-banner-action" href="https://go.sans.org/MBGfxJ" target="_blank" rel="noopener noreferrer">
          Vote for OASIS
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></svg>
        </a>
        <button className="award-banner-dismiss" type="button" onClick={dismiss} aria-label="Dismiss awards announcement">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12"/><path d="m18 6-12 12"/></svg>
        </button>
      </div>
    </aside>
  )
}
