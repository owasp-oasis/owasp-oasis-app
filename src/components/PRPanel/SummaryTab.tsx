/** SummaryTab — the short review brief shown before the full PR body. */
interface PRDetails {
  tldr: string | null
  consensus_accept: number
  consensus_modify: number
  consensus_reject: number
  consensus_duplicate: number
  participants: number
}

interface Props {
  details: PRDetails | null
  loading: boolean
  error: string | null
  onRetry?: () => void
}

export default function SummaryTab({ details, loading, error, onRetry }: Props) {
  if (loading) return <div className="prp-loading">Loading summary…</div>
  if (error) return <div className="prp-error" role="alert"><span>{error}</span>{onRetry && <button type="button" className="prp-error-retry" onClick={onRetry}>Retry</button>}</div>
  if (!details) return null

  const totalVotes = details.consensus_accept + details.consensus_modify + details.consensus_reject + details.consensus_duplicate
  const acceptRate = totalVotes ? details.consensus_accept / totalVotes : 0
  const participantRate = Math.min(1, details.participants / 10)
  const acceptPct = Math.round(acceptRate * 100)
  const trustNote = details.participants >= 10 && acceptRate >= .75
    ? 'This fix has reached the Trusted threshold.'
    : `Needs ${Math.max(0, 10 - details.participants)} more participant${10 - details.participants === 1 ? '' : 's'} to reach Trusted.`

  return <div className="prp-summary">
    <section className="prp-summary-brief">
      <span className="prp-summary-eyebrow">TL;DR</span>
      <p>{details.tldr ?? 'No short summary is available for this candidate fix.'}</p>
    </section>
    <section className="prp-consensus-card">
      <div className="prp-consensus-heading"><strong>Community consensus</strong><span>{totalVotes} {totalVotes === 1 ? 'vote' : 'votes'} · {details.participants} participants</span></div>
      <div className="prp-consensus-bar" aria-label={`${totalVotes} total votes`}>
        <div className="prp-consensus-seg-accept" style={{ width: `${totalVotes ? details.consensus_accept / totalVotes * 100 : 0}%` }} />
        <div className="prp-consensus-seg-modify" style={{ width: `${totalVotes ? details.consensus_modify / totalVotes * 100 : 0}%` }} />
        <div className="prp-consensus-seg-reject" style={{ width: `${totalVotes ? details.consensus_reject / totalVotes * 100 : 0}%` }} />
        <div className="prp-consensus-seg-duplicate" style={{ width: `${totalVotes ? details.consensus_duplicate / totalVotes * 100 : 0}%` }} />
      </div>
      <div className="prp-consensus-counts"><span className="consensus-accept">✓ {details.consensus_accept} accept</span><span className="consensus-modify">~ {details.consensus_modify} modify</span><span className="consensus-reject">✕ {details.consensus_reject} reject</span>{details.consensus_duplicate > 0 && <span className="consensus-duplicate">⧉ {details.consensus_duplicate} duplicate</span>}</div>
      <div className="prp-consensus-trust"><span>{trustNote}</span><div className="prp-consensus-meters"><div><span>Participants {details.participants}/10</span><i><b style={{ width: `${participantRate * 100}%` }} /></i></div><div><span>Accept rate {acceptPct}% / 75%</span><i><b style={{ width: `${Math.min(100, acceptRate * 100)}%` }} /></i></div></div></div>
    </section>
  </div>
}
