import './tabs.css'

type ToolRole = 'fix' | 'detect'

interface Tool {
  name: string
  role: ToolRole
  card_key: string
  login: string | null
  total_prs: number | null
  vulnerabilities: number | null
  accepted_upstream: number
  projects_worked: number
  interactions: number | null
  total_accept: number | null
  total_modify: number | null
  total_reject: number | null
}

const ROLE_LABELS: Record<ToolRole, string> = {
  fix:    'Fix tool',
  detect: 'Detection tool',
}

const ROLE_COLORS: Record<ToolRole, string> = {
  fix:    '#0F6FCF',
  detect: '#7C3AED',
}

function RoleBadge({ role }: { role: ToolRole }) {
  return (
    <span
      className="tool-role-badge"
      style={{ background: `${ROLE_COLORS[role]}18`, color: ROLE_COLORS[role], border: `1px solid ${ROLE_COLORS[role]}40` }}
    >
      {ROLE_LABELS[role]}
    </span>
  )
}

function ConsensusBar({ accept, modify, reject }: { accept: number; modify: number; reject: number }) {
  const total = accept + modify + reject
  if (total === 0) return <span className="no-consensus">No votes yet</span>
  return (
    <div className="consensus-bar" title={`Accept: ${accept} | Modify: ${modify} | Reject: ${reject}`}>
      {accept > 0 && <div className="cb-accept" style={{ flex: accept }} />}
      {modify > 0 && <div className="cb-modify" style={{ flex: modify }} />}
      {reject > 0 && <div className="cb-reject" style={{ flex: reject }} />}
    </div>
  )
}

function SentimentLabel({ accept, modify, reject }: { accept: number; modify: number; reject: number }) {
  const total = accept + modify + reject
  if (total === 0) return null
  const acceptRate = accept / total
  const rejectRate = reject / total
  if (acceptRate >= 0.7) return <span className="sentiment-label sentiment-positive">Mostly Accepted</span>
  if (rejectRate >= 0.5) return <span className="sentiment-label sentiment-negative">Mostly Rejected</span>
  return <span className="sentiment-label sentiment-mixed">Mixed</span>
}

function StatRow({ label, value, note }: { label: string; value: string | number | null; note?: string }) {
  const display = value === null || value === undefined ? '—' : value === 0 ? '0' : value
  return (
    <div className="tool-stat-row">
      <span className="tool-stat-label">{label}</span>
      <span className="tool-stat-value">{display}</span>
      {note && <span className="tool-stat-note">{note}</span>}
    </div>
  )
}

function FixCard({ tool }: { tool: Tool }) {
  const accept = tool.total_accept ?? 0
  const modify = tool.total_modify ?? 0
  const reject = tool.total_reject ?? 0

  return (
    <div className="tool-card" style={{ borderTop: `4px solid ${ROLE_COLORS.fix}` }}>
      <div className="tool-card-header">
        <div className="tool-card-title-row">
          <h3 className="tool-name">{tool.name}</h3>
          <RoleBadge role="fix" />
        </div>
        {tool.login && <span className="tool-login">@{tool.login}</span>}
      </div>

      <div className="tool-stats">
        <StatRow label="PRs submitted" value={tool.total_prs} note="(one per vulnerability)" />
        <StatRow label="Accepted upstream" value={tool.accepted_upstream} />
        <StatRow label="Projects worked on" value={tool.projects_worked} />
        <StatRow label="Interactions" value={tool.interactions} note="(comments on PRs)" />
      </div>

      <div className="tool-sentiment">
        <div className="tool-sentiment-header">
          <span className="tool-sentiment-title">Community Trust Sentiment</span>
          <SentimentLabel accept={accept} modify={modify} reject={reject} />
        </div>
        <ConsensusBar accept={accept} modify={modify} reject={reject} />
        <div className="consensus-labels">
          <span className="cl-accept">✅ {accept} Accept</span>
          <span className="cl-modify">⚠️ {modify} Modify</span>
          <span className="cl-reject">👎 {reject} Reject</span>
        </div>
      </div>
    </div>
  )
}

function DetectCard({ tool }: { tool: Tool }) {
  return (
    <div className="tool-card" style={{ borderTop: `4px solid ${ROLE_COLORS.detect}` }}>
      <div className="tool-card-header">
        <div className="tool-card-title-row">
          <h3 className="tool-name">{tool.name}</h3>
          <RoleBadge role="detect" />
        </div>
      </div>

      <div className="tool-stats">
        <StatRow label="Vulnerabilities identified" value={tool.vulnerabilities} />
        <StatRow label="Projects worked on" value={tool.projects_worked} />
        <StatRow label="PRs accepted upstream" value={tool.accepted_upstream} />
      </div>

      <p className="tool-detect-note">
        Detection tools identify vulnerabilities. Fix quality and community trust
        sentiment are attributed to the fix tool that generated the patch.
      </p>
    </div>
  )
}

interface Props {
  data: Tool[]
  loading: boolean
}

export default function ToolsTab({ data, loading }: Props) {
  if (loading) return <div className="tab-loading">Loading tools…</div>

  if (data.length === 0) {
    return (
      <div className="tab-empty">
        No tool data yet. Tools are identified by bot PR author login and by
        "Detected By" fields in PR bodies. Sync will populate this shortly.
      </div>
    )
  }

  const fixTools    = data.filter(t => t.role === 'fix')
  const detectTools = data.filter(t => t.role === 'detect')

  return (
    <>
      <p className="tab-note">
        Each tool appears as a separate card for each role it plays.
        {' '}<strong>Fix tools</strong> generate candidate security fixes (identified by bot PR author).
        {' '}<strong>Detection tools</strong> identify the underlying vulnerability (identified by
        "Detected By" fields in PR bodies). A tool that does both gets one card per role.
        Community trust sentiment reflects validator votes on the fix, not the detection.
      </p>

      <div className="tools-grid">
        {fixTools.map(tool => (
          <FixCard key={tool.card_key} tool={tool} />
        ))}
        {detectTools.map(tool => (
          <DetectCard key={tool.card_key} tool={tool} />
        ))}
      </div>
    </>
  )
}
