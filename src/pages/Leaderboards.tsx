import { useState, useEffect, useCallback, useRef } from 'react'
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
  { id: 'tools',        label: 'Tools' },
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

  const [repos, setRepos]               = useState([])
  const [prs, setPRs]                   = useState([])
  const [contributors, setContributors] = useState([])
  const [tools, setTools]               = useState([])
  const [maintainers, setMaintainers]   = useState([])
  const [loaded, setLoaded]             = useState<Set<Tab>>(new Set())
  const [loading, setLoading]           = useState<Tab | null>(null)

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
    try {
      const endpoints: Record<Tab, string> = {
        projects:     '/api/leaderboard/repos',
        prs:          '/api/leaderboard/prs',
        contributors: '/api/leaderboard/contributors',
        tools:        '/api/leaderboard/tools',
        maintainers:  '/api/leaderboard/maintainers',
      }
      const res = await fetch(endpoints[tab])
      const data = await res.json()
      if (tab === 'projects')     setRepos(data as never[])
      if (tab === 'prs')          setPRs(data as never[])
      if (tab === 'contributors') setContributors(data as never[])
      if (tab === 'tools')        setTools(data as never[])
      if (tab === 'maintainers')  setMaintainers(data as never[])
      setLoaded(prev => new Set([...prev, tab]))
    } catch {
      // leave empty
    } finally {
      setLoading(null)
    }
  }, [loaded])

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
            {activeTab === 'projects' && (
              <ProjectsTab data={repos} loading={loading === 'projects'} />
            )}
            {activeTab === 'prs' && (
              <PRsTab data={prs} loading={loading === 'prs'} />
            )}
            {activeTab === 'contributors' && (
              <ContributorsTab data={contributors} loading={loading === 'contributors'} />
            )}
            {activeTab === 'tools' && (
              <ToolsTab data={tools} loading={loading === 'tools'} />
            )}
            {activeTab === 'maintainers' && (
              <MaintainersTab data={maintainers} loading={loading === 'maintainers'} />
            )}
          </div>

        </div>
      </section>
    </div>
  )
}
