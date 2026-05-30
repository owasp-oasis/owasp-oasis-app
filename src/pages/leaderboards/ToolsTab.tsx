import './tabs.css'

type ToolRole = 'detect' | 'fix' | 'validate'

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
  /** Only set on the Human Validators aggregate card */
  validator_count?: number | null
}

/* ── Role metadata ──────────────────────────────────────────────── */

const ROLE_LABELS: Record<ToolRole, string> = {
  detect:   'Detection tool',
  fix:      'Fix tool',
  validate: 'Validate tool',
}

const ROLE_COLORS: Record<ToolRole, string> = {
  detect:   '#7C3AED', // purple
  fix:      '#0F6FCF', // blue
  validate: '#059669', // green
}

/* ── Shared sub-components ──────────────────────────────────────── */

function RoleBadge({ role }: { role: ToolRole }) {
  const color = ROLE_COLORS[role]
  return (
    <span
      className="tool-role-badge"
      style={{
        background: `${color}18`,
        color,
        border: `1px solid ${color}40`,
      }}
    >
      {ROLE_LABELS[role]}
    </span>
  )
}

function ConsensusBar({
  accept,
  modify,
  reject,
}: {
  accept: number
  modify: number
  reject: number
}) {
  const total = accept + modify + reject
  if (total === 0) return <span className="no-consensus">No votes yet</span>
  return (
    <div
      className="consensus-bar"
      title={`Accept: ${accept} | Modify: ${modify} | Reject: ${reject}`}
    >
      {accept > 0 && <div className="cb-accept" style={{ flex: accept }} />}
      {modify > 0 && <div className="cb-modify" style={{ flex: modify }} />}
      {reject > 0 && <div className="cb-reject" style={{ flex: reject }} />}
    </div>
  )
}

function SentimentLabel({
  accept,
  modify,
  reject,
}: {
  accept: number
  modify: number
  reject: number
}) {
  const total = accept + modify + reject
  if (total === 0) return null
  const acceptRate = accept / total
  const rejectRate = reject / total
  if (acceptRate >= 0.7)
    return <span className="sentiment-label sentiment-positive">Mostly Accepted</span>
  if (rejectRate >= 0.5)
    return <span className="sentiment-label sentiment-negative">Mostly Rejected</span>
  return <span className="sentiment-label sentiment-mixed">Mixed</span>
}

function StatRow({
  label,
  value,
  note,
}: {
  label: string
  value: string | number | null | undefined
  note?: string
}) {
  const display =
    value === null || value === undefined ? '—' : value === 0 ? '0' : value
  return (
    <div className="tool-stat-row">
      <span className="tool-stat-label">{label}</span>
      <span className="tool-stat-value">{display}</span>
      {note && <span className="tool-stat-note">{note}</span>}
    </div>
  )
}

/* ── Role-specific cards ────────────────────────────────────────── */

function DetectCard({ tool }: { tool: Tool }) {
  return (
    <div
      className="tool-card"
      style={{ borderTop: `4px solid ${ROLE_COLORS.detect}` }}
    >
      <div className="tool-card-header">
        <div className="tool-card-title-row">
          <h3 className="tool-name">{tool.name}</h3>
          <RoleBadge role="detect" />
        </div>
      </div>

      <div className="tool-stats">
        <StatRow label="Vulnerabilities identified" value={tool.vulnerabilities} />
        <StatRow label="Projects worked on"         value={tool.projects_worked} />
        <StatRow label="PRs accepted upstream"      value={tool.accepted_upstream} />
      </div>

      <p className="tool-detect-note">
        Detection tools identify vulnerabilities. Fix quality and community trust
        sentiment are attributed to the fix tool that generated the patch.
      </p>
    </div>
  )
}

function FixCard({ tool }: { tool: Tool }) {
  const accept = tool.total_accept ?? 0
  const modify = tool.total_modify ?? 0
  const reject = tool.total_reject ?? 0

  return (
    <div
      className="tool-card"
      style={{ borderTop: `4px solid ${ROLE_COLORS.fix}` }}
    >
      <div className="tool-card-header">
        <div className="tool-card-title-row">
          <h3 className="tool-name">{tool.name}</h3>
          <RoleBadge role="fix" />
        </div>
        {tool.login && <span className="tool-login">@{tool.login}</span>}
      </div>

      <div className="tool-stats">
        <StatRow
          label="PRs submitted"
          value={tool.total_prs}
          note="(one per vulnerability)"
        />
        <StatRow label="Accepted upstream"   value={tool.accepted_upstream} />
        <StatRow label="Projects worked on"  value={tool.projects_worked} />
        <StatRow
          label="OASIS interactions"
          value={tool.interactions}
          note="(template-matched comments on PRs)"
        />
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

function ValidateCard({ tool }: { tool: Tool }) {
  const accept = tool.total_accept ?? 0
  const modify = tool.total_modify ?? 0
  const reject = tool.total_reject ?? 0
  const isHuman = tool.card_key === 'validate:humans'

  return (
    <div
      className="tool-card"
      style={{ borderTop: `4px solid ${ROLE_COLORS.validate}` }}
    >
      <div className="tool-card-header">
        <div className="tool-card-title-row">
          <h3 className="tool-name">{tool.name}</h3>
          <RoleBadge role="validate" />
        </div>
        {tool.login && <span className="tool-login">@{tool.login}</span>}
      </div>

      <div className="tool-stats">
        <StatRow
          label="Validations posted"
          value={tool.interactions}
          note="(OASIS-template comments)"
        />
        {isHuman && tool.validator_count != null && (
          <StatRow label="Unique validators" value={tool.validator_count} />
        )}
        <StatRow label="Projects covered" value={tool.projects_worked} />
      </div>

      <div className="tool-sentiment">
        <div className="tool-sentiment-header">
          <span className="tool-sentiment-title">Validation Breakdown</span>
          <SentimentLabel accept={accept} modify={modify} reject={reject} />
        </div>
        <ConsensusBar accept={accept} modify={modify} reject={reject} />
        <div className="consensus-labels">
          <span className="cl-accept">✅ {accept} Accept</span>
          <span className="cl-modify">⚠️ {modify} Modify</span>
          <span className="cl-reject">👎 {reject} Reject</span>
        </div>
      </div>

      {isHuman && (
        <p className="tool-detect-note">
          Human validators post OASIS-template comments with accept, modify, or
          reject decisions. Their combined activity is shown here as an aggregate.
          Individual scores appear on the Contributors leaderboard.
        </p>
      )}
    </div>
  )
}

/* ── Section wrapper ────────────────────────────────────────────── */

interface SectionProps {
  role: ToolRole
  tools: Tool[]
  description: string
  /** When provided, renders the section header + this message instead of hiding when tools is empty. */
  emptyMessage?: string
}

function ToolsSection({ role, tools, description, emptyMessage }: SectionProps) {
  if (tools.length === 0 && !emptyMessage) return null
  const color = ROLE_COLORS[role]
  return (
    <section className="tools-section">
      <div
        className="tools-section-header"
        style={{ borderLeftColor: color }}
      >
        <h2 className="tools-section-title" style={{ color }}>
          {role.charAt(0).toUpperCase() + role.slice(1)}
        </h2>
        <p className="tools-section-desc">{description}</p>
      </div>
      {tools.length === 0
        ? <p className="tools-section-empty">{emptyMessage}</p>
        : (
          <div className="tools-grid">
            {tools.map(tool => {
              if (role === 'detect')   return <DetectCard   key={tool.card_key} tool={tool} />
              if (role === 'fix')      return <FixCard      key={tool.card_key} tool={tool} />
              if (role === 'validate') return <ValidateCard key={tool.card_key} tool={tool} />
              return null
            })}
          </div>
        )
      }
    </section>
  )
}

/* ── Tab root ───────────────────────────────────────────────────── */

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

  const detectTools   = data.filter(t => t.role === 'detect')
  const fixTools      = data.filter(t => t.role === 'fix')
  const validateTools = data.filter(t => t.role === 'validate')

  return (
    <>
      <p className="tab-note">
        The Tools leaderboard is organized by the role each tool plays in the OASIS
        security pipeline.{' '}
        <strong>Detect</strong> tools find vulnerabilities (identified by "Detected By"
        fields in PR bodies).{' '}
        <strong>Fix</strong> tools generate candidate patches (identified by bot PR
        author login).{' '}
        <strong>Validate</strong> tools — both automated and human — review patches
        and post accept/modify/reject decisions using the OASIS comment template.
        A tool that performs more than one role will appear once per role it plays.
      </p>

      <ToolsSection
        role="detect"
        tools={detectTools}
        description="Scan codebases to identify vulnerabilities and generate the tracked PRs."
      />
      <ToolsSection
        role="fix"
        tools={fixTools}
        description="Generate candidate security patches submitted as pull requests."
      />
      <ToolsSection
        role="validate"
        tools={validateTools}
        description="Review patches and render accept, modify, or reject verdicts using the OASIS comment template."
        emptyMessage="Validation data will populate after the next cron sync."
      />
    </>
  )
}
