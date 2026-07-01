import { useState, useEffect, useCallback, useRef } from 'react'
import type { Decision } from '../components/VoteForm'
import ProjectsTab from './leaderboards/ProjectsTab'
import PRsTab from './leaderboards/PRsTab'
import ContributorsTab from './leaderboards/ContributorsTab'
import MaintainersTab from './leaderboards/MaintainersTab'
import ToolsTab from './leaderboards/ToolsTab'
import './Leaderboards.css'

type Tab = 'projects' | 'prs' | 'contributors' | 'tools' | 'maintainers'

const TABS: { id: Tab; label: string }[] = [
  { id: 'projects',      label: 'Projects' },
  { id: 'prs',          label: 'PRs' },
  { id: 'contributors', label: 'Contributors' },
  // { id: 'tools',        label: 'Tools' },
  { id: 'maintainers',  label: 'Maintainers' },
]

interface Meta {
  last_synced_at: string | null
  sync_running: boolean
}

function timeAgo(iso: string | null): string {
  if (!iso) return 'never'
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export default function Leaderboards() {
  const [activeTab, setActiveTab] = useState<Tab>('prs')
  const [meta, setMeta] = useState<Meta>({ last_synced_at: null, sync_running: false })
  const [tabsSticky, setTabsSticky] = useState(false)
  const sentinelRef = useRef<HTMLDivElement>(null)

  const [repos, setRepos]               = useState<any[]>([])
  const [prs, setPRs]                   = useState<any[]>([])
  const [contributors, setContributors] = useState<any[]>([])
  const [tools, setTools]               = useState<any[]>([])
  const [maintainers, setMaintainers]   = useState<any[]>([])
  const [loaded, setLoaded]             = useState<Set<Tab>>(new Set())
  const [loading, setLoading]           = useState<Tab | null>(null)
  const [tabErrors, setTabErrors]       = useState<Partial<Record<Tab, string>>>({})
  const [myVotes]           = useState<Map<number, Decision>>(new Map())
  const [prsInitialRepo, setPrsInitialRepo] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/leaderboard/meta')
      .then(r => r.json())
      .then(d => setMeta(d as Meta))
      .catch(() => {})
  }, [])

  // Sticky tabs: observe sentinel just above the tab bar
  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        const docked = !entry.isIntersecting
        setTabsSticky(docked)
        if (docked) {
          document.body.classList.add('lb-tabs-docked')
        } else {
          document.body.classList.remove('lb-tabs-docked')
        }
      },
      { threshold: 0, rootMargin: '0px' }
    )
    observer.observe(sentinel)

    return () => {
      observer.disconnect()
      document.body.classList.remove('lb-tabs-docked')
    }
  }, [])

  const fetchTab = useCallback(async (tab: Tab) => {
    if (loaded.has(tab)) return
    setLoading(tab)
    // Clear error on retry
    setTabErrors(prev => { const n = {...prev}; delete n[tab]; return n })
    try {
      const endpoints: Record<Tab, string> = {
        projects:     '/api/leaderboard/repos',
        prs:          '/api/leaderboard/prs',
        contributors: '/api/leaderboard/contributors',
        tools:        '/api/leaderboard/tools',
        maintainers:  '/api/leaderboard/maintainers',
      }
      const res = await fetch(endpoints[tab])
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} — ${res.statusText || 'server error'}`)
      }
      const data = await res.json()
      if (!Array.isArray(data)) {
        throw new Error('Server returned an unexpected format (not an array)')
      }
      if (tab === 'projects')     setRepos(data)
      if (tab === 'prs')          setPRs(data)
      if (tab === 'contributors') setContributors(data)
      if (tab === 'tools')        setTools(data)
      if (tab === 'maintainers')  setMaintainers(data)
      setLoaded(prev => new Set([...prev, tab]))
    } catch (e) {
      const msg = (e as Error).message ?? 'Unknown error'
      setTabErrors(prev => ({ ...prev, [tab]: msg }))
    } finally {
      setLoading(null)
    }
  }, [loaded])

  const handleRetry = useCallback((tab: Tab) => {
    setLoaded(prev => { const n = new Set(prev); n.delete(tab); return n })
    setTabErrors(prev => { const n = {...prev}; delete n[tab]; return n })
  }, [])

  const handleNavigateToPRs = useCallback((repoName: string) => {
    setPrsInitialRepo(repoName)
    setActiveTab('prs')
    // Ensure data is loaded
    if (!loaded.has('prs')) {
      setTimeout(() => fetchTab('prs'), 0)
    }
  }, [loaded, fetchTab])

  useEffect(() => {
    fetchTab(activeTab)
  }, [activeTab, fetchTab])

  return (
    <div className="leaderboards">
      <div className="page-hero">
        <div className="container">
          <h1>Leaderboards</h1>
          <p>
            Where we surface work to be done, celebrate participant success, and help
            open source maintainers find the next PR they should merge.
          </p>
        </div>
      </div>

      <section className="section">
        <div className="container">

          {/* Sentinel — zero-height, triggers tab docking when scrolled past */}
          <div ref={sentinelRef} style={{ height: 0 }} aria-hidden="true" />

          {/* Tab nav */}
          {tabsSticky && <div className="lb-tabs-placeholder" aria-hidden="true" />}
          <div className={`lb-tabs${tabsSticky ? ' lb-tabs--sticky' : ''}`} role="tablist">
            {TABS.map(tab => (
              <button
                key={tab.id}
                role="tab"
                aria-selected={activeTab === tab.id}
                className={`lb-tab${activeTab === tab.id ? ' lb-tab--active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
            {/* Sync status chip — right side of tab bar */}
            <span className="lb-sync-chip" title={meta.last_synced_at ?? undefined}>
              {meta.sync_running ? '⟳ syncing…' : `↻ ${timeAgo(meta.last_synced_at)}`}
            </span>
          </div>

          {/* Tab panels */}
          <div className="lb-panel" role="tabpanel">
            {tabErrors[activeTab] ? (
              <div className="lb-error-block">
                <h3 className="lb-error-block__title">⚠️ Failed to load {activeTab} data</h3>
                <p className="lb-error-block__detail">
                  <code>{tabErrors[activeTab]}</code>
                </p>
                <div className="lb-error-block__advice">
                  <p><strong>Troubleshooting:</strong></p>
                  <ul>
                    <li>Check your internet connection</li>
                    <li>The OASIS server may be temporarily unavailable. Data syncs run every 4 hours, and the server may be restarting during that time.</li>
                    <li>Try clicking the button below to retry. If the error persists, the service may be undergoing maintenance.</li>
                    <li>If you continue to see this error, <a href="https://github.com/OWASP/oasis/issues" target="_blank" rel="noopener noreferrer">report it on GitHub</a></li>
                  </ul>
                </div>
                <button className="lb-error-retry" onClick={() => handleRetry(activeTab)}>
                  Try again
                </button>
              </div>
            ) : activeTab === 'projects' ? (
              <ProjectsTab
                data={repos}
                loading={loading === 'projects'}
                myVotes={myVotes}
                onNavigateToPRs={handleNavigateToPRs}
              />
            ) : activeTab === 'prs' ? (
              <PRsTab
                data={prs}
                loading={loading === 'prs'}
                initialRepoFilter={prsInitialRepo}
              />
            ) : activeTab === 'contributors' ? (
              <ContributorsTab data={contributors} loading={loading === 'contributors'} />
            ) : activeTab === 'tools' ? (
              <ToolsTab data={tools} loading={loading === 'tools'} />
            ) : activeTab === 'maintainers' ? (
              <MaintainersTab data={maintainers} loading={loading === 'maintainers'} />
            ) : null}
          </div>

        </div>
      </section>
    </div>
  )
}
