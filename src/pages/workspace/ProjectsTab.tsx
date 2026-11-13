import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import './tabs.css'
import ProjectPanel, { type Repo } from '../../components/ProjectPanel/ProjectPanel'
import type { Decision } from '../../components/VoteForm'

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

function LangBadge({
  lang,
  onFilter,
  isActive,
}: {
  lang: string | null
  onFilter?: (lang: string) => void
  isActive?: boolean
}) {
  if (!lang) return null
  const color = LANG_COLORS[lang] ?? '#666'
  return (
    <button
      className={`lang-badge${isActive ? ' lang-badge--active' : ''}`}
      style={{ '--lang-color': color } as React.CSSProperties}
      onClick={(e) => {
        e.stopPropagation()
        onFilter?.(lang)
      }}
      title={isActive ? 'Clear language filter' : `Filter by ${lang}`}
    >
      <span className="lang-dot" aria-hidden="true" />
      {lang}
    </button>
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
  myVotes: Map<number, Decision>
  onNavigateToPRs: (repoId: number) => void
  mockup?: boolean
}

export default function ProjectsTab({ data, loading, myVotes, onNavigateToPRs, mockup = false }: Props) {
  const [selectedRepo, setSelectedRepo] = useState<Repo | null>(null)
  const [langFilter, setLangFilter] = useState<string | null>(null)
  const [searchParams, setSearchParams] = useSearchParams()

  useEffect(() => {
    const repoId = Number(searchParams.get('repoId'))
    if (!Number.isSafeInteger(repoId) || repoId <= 0 || !data.length) return
    const repo = data.find(item => item.id === repoId)
    if (repo) setSelectedRepo(repo)
  }, [data, searchParams])

  if (loading) return <div className="tab-loading">Loading projects…</div>
  if (data.length === 0) return <div className="tab-empty">No project data yet. Sync will populate this shortly.</div>

  // Filter by language if active
  const filteredData = langFilter ? data.filter(r => r.language === langFilter) : data

  return (
    <>
      <ProjectPanel
        repo={selectedRepo}
        onClose={() => {
          setSelectedRepo(null)
          const next = new URLSearchParams(searchParams)
          next.delete('repoId')
          setSearchParams(next, { replace: true })
        }}
        onNavigateToPRs={onNavigateToPRs}
        myVotes={myVotes}
        mockup={mockup}
      />

      <div className="projects-tab">
        {langFilter && (
          <div className="filter-chip-row">
            <button className="filter-chip active" onClick={() => setLangFilter(null)}>
              × {langFilter}
            </button>
          </div>
        )}

        <div className="projects-grid">
          {filteredData.map(repo => (
            <article
              key={repo.id}
              className="project-card"
            >
              <div className="project-card-header">
                <div className="project-card-name">
                  <button type="button" className="project-card-title" onClick={() => setSelectedRepo(repo)}>
                    {repo.name}
                  </button>
                  {repo.upstream_url && (
                    <a
                      href={repo.upstream_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="upstream-link"
                      title="View upstream repo"
                      onClick={(e) => e.stopPropagation()}
                    >
                      ↗ upstream
                    </a>
                  )}
                </div>
                <LangBadge
                  lang={repo.language}
                  onFilter={(lang) => setLangFilter(lang === langFilter ? null : lang)}
                  isActive={repo.language === langFilter}
                />
              </div>

              {repo.description && (
                <p className="project-card-desc">{repo.description}</p>
              )}

              <div className="project-card-stats">
                <button
                  className="stat stat-clickable"
                  onClick={(e) => {
                    e.stopPropagation()
                    setSelectedRepo(repo)
                  }}
                >
                  <span className="stat-value">{repo.open_prs}</span>
                  <span className="stat-label">Open</span>
                </button>
                <button
                  className="stat stat-clickable"
                  onClick={(e) => {
                    e.stopPropagation()
                    setSelectedRepo(repo)
                  }}
                >
                  <span className="stat-value">{Math.max(0, repo.open_prs - Array.from(myVotes.keys()).length)}</span>
                  <span className="stat-label">Need my vote</span>
                </button>
                <button
                  className="stat stat-clickable"
                  onClick={(e) => {
                    e.stopPropagation()
                    setSelectedRepo(repo)
                  }}
                >
                  <span className="stat-value">{repo.accepted_outcomes ?? repo.total_accept}</span>
                  <span className="stat-label">Accepted</span>
                </button>
              </div>

              {mockup && (
                <div className="project-card-summary" aria-label="Project summary">
                  {repo.stars > 0 && <span>⭐ {repo.stars.toLocaleString()} stars</span>}
                  <span>{repo.total_prs.toLocaleString()} total PRs</span>
                  <span>{repo.contributors.toLocaleString()} contributors</span>
                </div>
              )}

              <div className="project-card-consensus">
                <ConsensusBar
                  accept={repo.total_accept}
                  modify={repo.total_modify}
                  reject={repo.total_reject}
                />
                <button className="consensus-labels" onClick={(e) => { e.stopPropagation(); onNavigateToPRs(repo.id) }}>Review {repo.name} fixes →</button>
              </div>
            </article>
          ))}
        </div>
      </div>

    </>
  )
}
