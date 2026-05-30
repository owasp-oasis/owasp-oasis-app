/**
 * SummaryTab — vulnerability card derived from parsed PR details.
 * Receives details from PRPanel (no separate fetch).
 */
interface PRDetails {
  cwe_id: string | null
  cwe_desc: string | null
  cvss_severity: string | null
  cve_id: string | null
  capec_id: string | null
  cvss_score: string | null
  tldr: string | null
  detection_tool: string | null
  consensus_accept: number
  consensus_modify: number
  consensus_reject: number
}

interface Props {
  details: PRDetails | null
  loading: boolean
  error: string | null
}

const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low']

export default function SummaryTab({ details, loading, error }: Props) {
  if (loading) return <div className="prp-loading">Loading summary…</div>
  if (error)   return <div className="prp-error">{error}</div>
  if (!details) return null

  const sev = details.cvss_severity ?? null
  const sevClass = sev && SEVERITY_ORDER.includes(sev) ? `prp-severity-badge--${sev}` : 'prp-severity-badge--low'

  const totalVotes = details.consensus_accept + details.consensus_modify + details.consensus_reject
  const acceptPct  = totalVotes > 0 ? (details.consensus_accept / totalVotes) * 100 : 0
  const modifyPct  = totalVotes > 0 ? (details.consensus_modify / totalVotes) * 100 : 0
  const rejectPct  = totalVotes > 0 ? (details.consensus_reject / totalVotes) * 100 : 0

  const hasVulnData = details.cwe_id || details.cve_id || details.cvss_severity || details.tldr

  return (
    <div>
      {/* Vulnerability card */}
      {hasVulnData ? (
        <div className="prp-vuln-card">
          <div className="prp-vuln-card-header">
            {sev && (
              <span className={`prp-severity-badge ${sevClass}`}>
                {sev}
              </span>
            )}
            {details.cwe_id && (
              <span className="prp-vuln-id">
                {details.cwe_id}
                {details.cwe_desc ? ` — ${details.cwe_desc}` : ''}
              </span>
            )}
          </div>

          {(details.cve_id || details.capec_id || details.cvss_score || details.detection_tool) && (
            <div className="prp-vuln-grid">
              {details.cve_id && (
                <>
                  <span className="prp-vuln-key">CVE</span>
                  <span className="prp-vuln-val">{details.cve_id}</span>
                </>
              )}
              {details.capec_id && (
                <>
                  <span className="prp-vuln-key">CAPEC</span>
                  <span className="prp-vuln-val">{details.capec_id}</span>
                </>
              )}
              {details.cvss_score && (
                <>
                  <span className="prp-vuln-key">CVSS</span>
                  <span className="prp-vuln-val">{details.cvss_score}</span>
                </>
              )}
              {details.detection_tool && (
                <>
                  <span className="prp-vuln-key">Tool</span>
                  <span className="prp-vuln-val">{details.detection_tool}</span>
                </>
              )}
            </div>
          )}

          {details.tldr && (
            <div className="prp-tldr">
              {details.tldr}
            </div>
          )}
        </div>
      ) : (
        <p className="prp-no-data" style={{ marginBottom: 16 }}>
          No vulnerability metadata detected in this PR title or body.
        </p>
      )}

      {/* Consensus snapshot */}
      <div className="prp-consensus-card">
        <div className="prp-consensus-title">Consensus</div>
        {totalVotes > 0 ? (
          <>
            <div className="prp-consensus-bar">
              <div className="prp-consensus-seg-accept" style={{ width: `${acceptPct}%` }} />
              <div className="prp-consensus-seg-modify" style={{ width: `${modifyPct}%` }} />
              <div className="prp-consensus-seg-reject" style={{ width: `${rejectPct}%` }} />
            </div>
            <div className="prp-consensus-counts">
              <span className="consensus-accept">✓ {details.consensus_accept} accept</span>
              <span className="consensus-modify">~ {details.consensus_modify} modify</span>
              <span className="consensus-reject">✗ {details.consensus_reject} reject</span>
            </div>
          </>
        ) : (
          <p className="prp-no-data">No votes yet.</p>
        )}
      </div>
    </div>
  )
}
