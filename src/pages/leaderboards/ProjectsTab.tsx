import './tabs.css'

interface Repo {
  id: number
  name: string
  full_name: string
  description: string | null
  language: string | null
  open_prs: number
  stars: number
  upstream_url: string | null
  total_prs: number
  contributors: number
  total_accept: number
  total_modify: number
  total_reject: number
}

const LANG_COLORS: Record<string, string> = {
  JavaScript: '#f7df1e',
  TypeScript: '#3178c6',
  Python: '#3572A5',
  Java: '#b07219',
  Go: '#00ADD8',
  Rust: '#dea584',
  Ruby: '#701516',
  'C++': '#f34b7d',
  C: '#555555',
  Swift: '#F05138',
  Kotlin: '#A97BFF',
}

function LangBadge({ lang }: { lang: string | null }) {
  if (!lang) return null
  const color = LANG_COLORS[lang] ?? '#666'
  return (
    <span className="lang-badge" style={{ '--lang-color': color } as React.CSSProperties}>
      <span className="lang-dot" aria-hidden="true" />
      {lang}
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

interface Props {
  data: Repo[]
  loading: boolean
}

export default function ProjectsTab({ data, loading }: Props) {
  if (loading) return <div className="tab-loading">Loading projects…</div>
  if (data.length === 0) return <div className="tab-empty">No project data yet. Sync will populate this shortly.</div>

  return (
    <div className="projects-grid">
      {data.map(repo => (
        <div key={repo.id} className="project-card">
          <div className="project-card-header">
            <div className="project-card-name">
              <a
                href={`https://github.com/owasp-oasis/${repo.name}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                {repo.name}
              </a>
              {repo.upstream_url && (
                <a
                  href={repo.upstream_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="upstream-link"
                  title="View upstream repo"
                >
                  ↗ upstream
                </a>
              )}
            </div>
            <LangBadge lang={repo.language} />
          </div>

          {repo.description && (
            <p className="project-card-desc">{repo.description}</p>
          )}

          <div className="project-card-stats">
            <div className="stat">
              <span className="stat-value">{repo.open_prs}</span>
              <span className="stat-label">Open PRs</span>
            </div>
            <div className="stat">
              <span className="stat-value">{repo.total_prs}</span>
              <span className="stat-label">Total PRs</span>
            </div>
            <div className="stat">
              <span className="stat-value">{repo.contributors}</span>
              <span className="stat-label">Contributors</span>
            </div>
          </div>

          <div className="project-card-consensus">
            <div className="consensus-labels">
              <span className="cl-accept">✓ {repo.total_accept} Accept</span>
              <span className="cl-modify">~ {repo.total_modify} Modify</span>
              <span className="cl-reject">✕ {repo.total_reject} Reject</span>
            </div>
            <ConsensusBar
              accept={repo.total_accept}
              modify={repo.total_modify}
              reject={repo.total_reject}
            />
          </div>
        </div>
      ))}
    </div>
  )
}
