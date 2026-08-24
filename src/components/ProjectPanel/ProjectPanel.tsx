/**
 * ProjectPanel — slide-out detail panel for a single project.
 *
 * Tabs: Overview | PRs | Contributors
 * Fetches from GET /api/leaderboard/repos/:id
 * Inner panels (PRPanel, ContributorPanel) stack on top.
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import './ProjectPanel.css';
import type { Decision } from '../VoteForm';
import PRPanel from '../PRPanel/PRPanel';
import ContributorPanel from '../ContributorPanel/ContributorPanel';

/* ─── Types ───────────────────────────────────────────────────── */
interface Repo {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  language: string | null;
  open_prs: number;
  duplicate_count: number;
  stars: number;
  upstream_url: string | null;
  total_prs: number;
  contributors: number;
  total_accept: number;
  total_modify: number;
  total_reject: number;
}

interface PR {
  id: number;
  number: number;
  title: string;
  state: string;
  author: string | null;
  html_url: string;
  comment_count: number;
  oasis_comment_count: number;
  non_oasis_comment_count: number;
  participants: number;
  consensus_accept: number;
  consensus_modify: number;
  consensus_reject: number;
  merged_upstream: number;
  updated_at: string;
}

interface PanelPRWithRepo extends PR {
  repo_name: string;
}

interface TopContributor {
  login: string;
  avatar_url: string | null;
  comment_count: number;
  accepts: number;
  modifies: number;
  rejects: number;
}

interface RepoDetailResponse {
  repo: Repo;
  prs: PanelPRWithRepo[];
  top_contributors: TopContributor[];
}

type PanelTab = 'overview' | 'prs' | 'contributors';

interface Props {
  repo: Repo | null;
  onClose: () => void;
  onNavigateToPRs?: (repoId: number) => void;
  myVotes: Map<number, Decision>;
}

/* ─── Skeleton shimmer (matching ContributorPanel) ─────────────── */
function SkeletonOverviewTab() {
  return (
    <div className="pp-skeleton-container">
      <div className="pp-skeleton-header-row">
        <div className="pp-skeleton-title"></div>
        <div className="pp-skeleton-badge"></div>
      </div>
      <div className="pp-skeleton-description"></div>
      <div className="pp-skeleton-stats-grid">
        {[1, 2, 3].map(i => (
          <div key={i} className="pp-skeleton-stat">
            <div className="pp-skeleton-stat-value"></div>
            <div className="pp-skeleton-stat-label"></div>
          </div>
        ))}
      </div>
      <div className="pp-skeleton-bar"></div>
    </div>
  );
}

/* ─── Helper: get OASIS status (same logic as PRsTab) ──────────── */
type OASISStatus = 'Needs Review' | 'Trusted' | 'Withdrawn' | 'Rejected' | 'Accepted';

function getOASISStatus(pr: PR): OASISStatus {
  if (pr.merged_upstream && pr.state === 'closed') return 'Accepted';
  if (pr.state === 'closed') {
    if (pr.consensus_accept > 0) return 'Withdrawn';
    return 'Rejected';
  }
  const totalVotes = pr.consensus_accept + pr.consensus_modify + pr.consensus_reject;
  const acceptRate = totalVotes > 0 ? pr.consensus_accept / totalVotes : 0;
  if (pr.participants >= 10 && acceptRate >= 0.75) return 'Trusted';
  return 'Needs Review';
}

function StatusBadge({ status }: { status: OASISStatus }) {
  const cls: Record<OASISStatus, string> = {
    'Needs Review': 'state-badge state-needs-review',
    'Trusted': 'state-badge state-trusted',
    'Withdrawn': 'state-badge state-withdrawn',
    'Rejected': 'state-badge state-closed',
    'Accepted': 'state-badge state-merged',
  };
  return <span className={cls[status]}>{status}</span>;
}

/* ─── Consensus bar (matching ProjectsTab) ────────────────────── */
function ConsensusBar({ accept, modify, reject }: { accept: number; modify: number; reject: number }) {
  const total = accept + modify + reject;
  if (total === 0) return <span className="no-consensus">No votes yet</span>;
  return (
    <div className="consensus-bar" title={`Accept: ${accept} | Modify: ${modify} | Reject: ${reject}`}>
      {accept > 0 && <div className="cb-accept" style={{ flex: accept }} />}
      {modify > 0 && <div className="cb-modify" style={{ flex: modify }} />}
      {reject > 0 && <div className="cb-reject" style={{ flex: reject }} />}
    </div>
  );
}

/* ─── Language badge ──────────────────────────────────────────── */
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
};

function LangBadge({ lang }: { lang: string | null }) {
  if (!lang) return null;
  const color = LANG_COLORS[lang] ?? '#666';
  return (
    <span className="lang-badge" style={{ '--lang-color': color } as React.CSSProperties}>
      <span className="lang-dot" aria-hidden="true" />
      {lang}
    </span>
  );
}

/* ─── Main panel ─────────────────────────────────────────────── */
export default function ProjectPanel({ repo, onClose, myVotes }: Props) {
  const [activeTab, setActiveTab] = useState<PanelTab>('overview');
  const [panelData, setPanelData] = useState<RepoDetailResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [initialTab, setInitialTab] = useState<PanelTab>('overview');
  const [initialPRFilter, setInitialPRFilter] = useState<'all' | 'open'>('all');

  // Inner panels
  const [selectedPR, setSelectedPR] = useState<PanelPRWithRepo | null>(null);
  const [selectedContributor, setSelectedContributor] = useState<string | null>(null);

  const prevRepoId = useRef<number | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  // Reset panel state when repo changes
  useEffect(() => {
    if (!repo) return;
    if (repo.id !== prevRepoId.current) {
      prevRepoId.current = repo.id;
      setActiveTab('overview');
      setPanelData(null);
      setError(null);
      setSelectedPR(null);
      setSelectedContributor(null);
      setInitialTab('overview');
      setInitialPRFilter('all');
      if (bodyRef.current) bodyRef.current.scrollTop = 0;
    }
  }, [repo]);

  // Fetch panel data
  const fetchData = useCallback(() => {
    if (!repo) return;
    setLoading(true);
    setError(null);
    fetch(`/api/leaderboard/repos/${repo.id}`)
      .then((r) => r.json() as Promise<{ ok: boolean; error?: string } & Partial<RepoDetailResponse>>)
      .then((d) => {
        if (!d.ok) {
          setError(d.error ?? 'Failed to load project details');
          return;
        }
        setPanelData(d as unknown as RepoDetailResponse);
      })
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, [repo]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Close on Escape
  useEffect(() => {
    if (!repo) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [repo, onClose]);

  // Sync activeTab with initialTab
  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  if (!repo) return null;

  const prs = panelData?.prs ?? [];
  const contributors = panelData?.top_contributors ?? [];

  // Filter PRs based on initialPRFilter
  const filteredPRs =
    initialPRFilter === 'open' ? prs.filter((p) => p.state === 'open') : prs;

  return (
    <>
      {selectedPR && (
        <PRPanel
          pr={{
            id: selectedPR.id,
            repo_name: selectedPR.repo_name,
            number: selectedPR.number,
            title: selectedPR.title,
            state: selectedPR.state,
            html_url: selectedPR.html_url,
            consensus_accept: selectedPR.consensus_accept,
            consensus_modify: selectedPR.consensus_modify,
            consensus_reject: selectedPR.consensus_reject,
          }}
          myVotes={myVotes}
          onClose={() => setSelectedPR(null)}
          onVoteSuccess={() => {
            // Refresh panel data after vote
            fetchData();
          }}
        />
      )}

      {selectedContributor && (
        <ContributorPanel login={selectedContributor} onClose={() => setSelectedContributor(null)} />
      )}

      <div className="pp-backdrop" onClick={onClose} aria-hidden="true" />

      <aside
        className="pp-panel pp-panel--open"
        role="complementary"
        aria-label={`Project ${repo.name} details`}
      >
        {/* Header */}
        <div className="pp-header">
          <button className="pp-close" onClick={onClose} aria-label="Close panel">
            ✕
          </button>
          <span className="pp-identity">{repo.name}</span>
          <div className="pp-header-spacer" />
          <a
            href={`https://github.com/owasp-oasis/${repo.name}`}
            target="_blank"
            rel="noopener noreferrer"
            className="pp-gh-link"
            title="Open on GitHub"
          >
            ↗ GitHub
          </a>
        </div>

        {/* Tab bar */}
        <div className="pp-tab-bar" role="tablist">
          {(['overview', 'prs', 'contributors'] as PanelTab[]).map((tab) => (
            <button
              key={tab}
              id={`pp-tab-${tab}`}
              role="tab"
              aria-selected={activeTab === tab}
              aria-controls="pp-tabpanel"
              className={`pp-tab${activeTab === tab ? ' pp-tab--active' : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* Scrollable body */}
        <div
          id="pp-tabpanel"
          className="pp-body"
          ref={bodyRef}
          role="tabpanel"
          aria-labelledby={`pp-tab-${activeTab}`}
        >
          {error && (
            <div className="pp-error">
              <p>{error}</p>
              <button onClick={fetchData}>Try again</button>
            </div>
          )}

          {!error && activeTab === 'overview' && (
            <div className="pp-overview-tab">
              {loading ? (
                <SkeletonOverviewTab />
              ) : panelData ? (
                <>
                  <div className="pp-overview-header">
                    <h2>{panelData.repo.full_name}</h2>
                    {panelData.repo.language && <LangBadge lang={panelData.repo.language} />}
                  </div>

                  {panelData.repo.description && (
                    <p className="pp-overview-description">{panelData.repo.description}</p>
                  )}

                  <div className="pp-overview-stats">
                    <div className="stat">
                      <span className="stat-value">{panelData.repo.open_prs}</span>
                      <span className="stat-label">Open PRs</span>
                    </div>
                    <div className="stat">
                      <span className="stat-value">{panelData.repo.total_prs}</span>
                      <span className="stat-label">Total PRs</span>
                    </div>
                    <div className="stat">
                      <span className="stat-value">{panelData.repo.contributors}</span>
                      <span className="stat-label">Contributors</span>
                    </div>
                  </div>

                  {panelData.repo.stars > 0 && (
                    <div className="pp-overview-stars">
                      <span>⭐ {panelData.repo.stars.toLocaleString()} stars</span>
                    </div>
                  )}

                  {panelData.repo.upstream_url && (
                    <div className="pp-overview-upstream">
                      <a href={panelData.repo.upstream_url} target="_blank" rel="noopener noreferrer">
                        ↗ View upstream repo
                      </a>
                    </div>
                  )}

                  <div className="pp-overview-consensus">
                    <div className="consensus-labels">
                      <span className="cl-accept">✓ {panelData.repo.total_accept} Accept</span>
                      <span className="cl-modify">~ {panelData.repo.total_modify} Modify</span>
                      <span className="cl-reject">✕ {panelData.repo.total_reject} Reject</span>
                    </div>
                    <ConsensusBar
                      accept={panelData.repo.total_accept}
                      modify={panelData.repo.total_modify}
                      reject={panelData.repo.total_reject}
                    />
                  </div>
                </>
              ) : null}
            </div>
          )}

          {!error && activeTab === 'prs' && (
            <div className="pp-prs-tab">
              {loading ? (
                <div className="pp-loading">Loading PRs…</div>
              ) : filteredPRs.length === 0 ? (
                <div className="pp-empty">
                  {initialPRFilter === 'open'
                    ? 'No open PRs for this project.'
                    : 'No PRs yet for this project.'}
                </div>
              ) : (
                <div className="pp-pr-list">
                  {filteredPRs.map((pr) => (
                    <button
                      key={pr.id}
                      className="pp-pr-row"
                      onClick={() => setSelectedPR(pr)}
                    >
                      <div className="pp-pr-number">#{pr.number}</div>
                      <div className="pp-pr-content">
                        <div className="pp-pr-title">{pr.title}</div>
                        <div className="pp-pr-meta">
                          by {pr.author ?? 'unknown'} •{' '}
                          {new Date(pr.updated_at).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                          })}
                        </div>
                      </div>
                      <div className="pp-pr-status">
                        <StatusBadge status={getOASISStatus(pr)} />
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {!error && activeTab === 'contributors' && (
            <div className="pp-contributors-tab">
              {loading ? (
                <div className="pp-loading">Loading contributors…</div>
              ) : contributors.length === 0 ? (
                <div className="pp-empty">No contributors yet for this project.</div>
              ) : (
                <div className="pp-contributor-list">
                  {contributors.map((contrib) => (
                    <button
                      key={contrib.login}
                      className="pp-contributor-row"
                      onClick={() => setSelectedContributor(contrib.login)}
                    >
                      {contrib.avatar_url && (
                        <img
                          src={contrib.avatar_url}
                          alt={contrib.login}
                          className="pp-contrib-avatar"
                        />
                      )}
                      <div className="pp-contrib-content">
                        <div className="pp-contrib-login">{contrib.login}</div>
                        <div className="pp-contrib-decisions">
                          ✓ {contrib.accepts} ~ {contrib.modifies} ✕ {contrib.rejects}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

export type { Repo };
