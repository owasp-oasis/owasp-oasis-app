/**
 * ContributorPanel — slide-out detail panel for a single OASIS contributor.
 *
 * Triggered from ContributorsTab when a row is clicked.
 * Fetches from GET /api/contributors/:login and renders four tabs:
 *   Score       — full score breakdown (comment, peer, reaction, trust, bonuses → modified rep)
 *   Contributions — all-time vs 90-day side-by-side list of OASIS comments
 *   Formula     — static explanation of the reputation formula
 */

import { useEffect, useState, useCallback } from 'react';
import ContributorAvatar from '../ContributorAvatar';
import './ContributorPanel.css';
import './ContributorPanelRefresh.css';

/* ─── TYPES ───────────────────────────────────────────────────── */
interface ContributorDetail {
  login: string;
  avatar_url: string | null;
  prs_worked: number;
  total_interactions: number;
  non_oasis_interactions: number;
  reactions_received: number;
  reactions_given: number;
  accepts: number;
  modifies: number;
  rejects: number;
  comment_score: number;
  peer_score: number;
  reaction_score: number;
  trust_score: number;
  base_reputation: number;
  modified_reputation: number;
  rank_90d: number | null;
  rank_90d_oldest_activity: string | null;
  synced_at: string | null;
}

interface Contribution {
  comment_id: number;
  pr_id: number;
  pr_number: number;
  repo_name: string;
  decision: 'accept' | 'modify' | 'reject' | null;
  commented_at: string;
  pr_created_at: string;
  pr_title: string;
  pr_url: string;
  merged_upstream: number;
  peer_score_earned: number;
  total_reactions: number;
  positive_reactions: number;
  negative_reactions: number;
  early_mover_bonus: number;
  early_bird_bonus: number;
  influencer_bonus: number;
}

interface ResponseBadgeCriterion {
  label: string;
  current: number;
  target: number;
  unit: 'count' | 'percent';
  met: boolean;
}

interface ResponseBadge {
  id: 'first_responder' | 'fast_responder' | 'coverage_contributor';
  name: string;
  kind: 'achievement' | 'activity';
  state: 'active' | 'locked';
  description: string;
  evidence: string;
  criteria: ResponseBadgeCriterion[];
}

interface ResponseBadgeSummary {
  badges: ResponseBadge[];
  calculatedAt: string;
  requestClockMeaning: string;
}

interface PanelData {
  contributor: ContributorDetail;
  allTimeRank: number;
  contributions: Contribution[];
  responseBadges: ResponseBadgeSummary;
}

type ActiveTab = 'score' | 'badges' | 'contributions' | 'formula';

/* ─── HELPERS ─────────────────────────────────────────────────── */
const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

function fmt(n: number, decimals = 2): string {
  if (!Number.isFinite(n)) return '0';
  return n.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function DecisionBadge({ decision }: { decision: string | null }) {
  if (!decision) return null;
  const cls = {
    accept: 'cp-badge cp-badge--accept',
    modify: 'cp-badge cp-badge--modify',
    reject: 'cp-badge cp-badge--reject',
  }[decision] ?? 'cp-badge';
  return <span className={cls}>{decision}</span>;
}

/* ─── SUB-COMPONENTS ──────────────────────────────────────────── */
function ScoreTab({ contributor, allTimeRank, onShowFormula }: {
  contributor: ContributorDetail;
  allTimeRank: number;
  onShowFormula: () => void;
}) {
  const totalBonus = contributor.modified_reputation > 0 && contributor.base_reputation > 0
    ? (contributor.modified_reputation / contributor.base_reputation - 1)
    : 0;
  const multiplier = 1 + totalBonus;
  const bonusPercent = Math.round(totalBonus * 100);
  const bonusLabel = `${bonusPercent >= 0 ? '+' : ''}${bonusPercent}%`;

  return (
    <div className="cp-tab-content cp-score-dashboard">
      <section className="cp-score-hero" aria-label="Reputation summary">
        <div className="cp-score-hero-main">
          <span className="cp-score-eyebrow">Modified reputation</span>
          <strong className="cp-score-hero-value">{fmt(contributor.modified_reputation)}</strong>
          <span className="cp-score-hero-caption">Complete OASIS contribution score</span>
        </div>
        <div className="cp-score-ranks">
          <span><small>All time</small><strong>#{allTimeRank}</strong></span>
          {contributor.rank_90d != null && (
            <span><small>Last 90 days</small><strong>#{contributor.rank_90d}</strong></span>
          )}
        </div>
        <div
          className="cp-score-equation"
          aria-label={`${fmt(contributor.base_reputation)} base reputation times ${multiplier.toFixed(2)} bonus multiplier equals ${fmt(contributor.modified_reputation)}`}
        >
          <span><small>Base score</small><strong>{fmt(contributor.base_reputation)}</strong></span>
          <b aria-hidden="true">×</b>
          <span className="cp-score-bonus-factor">
            <small>Bonus multiplier</small>
            <strong>{multiplier.toFixed(2)}× <em>{bonusLabel}</em></strong>
          </span>
          <b aria-hidden="true">=</b>
          <span><small>Reputation</small><strong>{fmt(contributor.modified_reputation)}</strong></span>
        </div>
      </section>

      <details className="cp-bonus-explainer">
        <summary>
          <span className="cp-bonus-help" aria-hidden="true">?</span>
          <span>
            <strong>How does the bonus multiplier work?</strong>
            <small>The base score receives an earned {bonusLabel} adjustment.</small>
          </span>
          <span className="cp-bonus-chevron" aria-hidden="true">⌄</span>
        </summary>
        <div className="cp-bonus-explainer-body">
          <p>
            Everyone starts at <strong>1.00×</strong>. OASIS adds the existing timing and
            influence bonuses, then multiplies the base score once. This contributor&apos;s
            multiplier is <strong>{multiplier.toFixed(2)}×</strong>, approximately a{' '}
            <strong>{bonusLabel} adjustment</strong> before final rounding.
          </p>
          <div className="cp-bonus-reasons">
            <span><b>Early mover</b><small>Among the first useful comments on a mature PR</small></span>
            <span><b>Early bird</b><small>Commented within the first 24 or 96 hours</small></span>
            <span><b>Influence</b><small>Community reactions to the contribution</small></span>
          </div>
          <button type="button" onClick={onShowFormula}>See the exact formula →</button>
        </div>
      </details>

      <section className="cp-score-section" aria-labelledby="score-composition-heading">
        <div className="cp-section-heading">
          <div>
            <span className="cp-section-kicker">How it adds up</span>
            <h3 id="score-composition-heading">Score composition</h3>
          </div>
          <span className="cp-section-total">{fmt(contributor.base_reputation)} base</span>
        </div>
        <div className="cp-score-components">
          <article className="cp-score-component cp-score-component--comments">
            <span className="cp-score-component-icon" aria-hidden="true">◆</span>
            <div><span>OASIS comments</span><small>{contributor.total_interactions} posted</small></div>
            <strong>{fmt(contributor.comment_score)}</strong>
          </article>
          <article className="cp-score-component cp-score-component--peer">
            <span className="cp-score-component-icon" aria-hidden="true">◎</span>
            <div><span>Peer agreement</span><small>{contributor.reactions_received} reactions received</small></div>
            <strong>{fmt(contributor.peer_score)}</strong>
          </article>
          <article className="cp-score-component cp-score-component--reactions">
            <span className="cp-score-component-icon" aria-hidden="true">↗</span>
            <div><span>Reactions given</span><small>{contributor.reactions_given} given · capped at 5</small></div>
            <strong>{fmt(contributor.reaction_score)}</strong>
          </article>
          <article className="cp-score-component cp-score-component--trust">
            <span className="cp-score-component-icon" aria-hidden="true">✓</span>
            <div><span>Trust score</span><small>{contributor.trust_score > 0 ? `${contributor.accepts} verified accept votes` : 'No qualifying merges yet'}</small></div>
            <strong>{fmt(contributor.trust_score)}</strong>
          </article>
        </div>
      </section>

      <section className="cp-score-section" aria-labelledby="activity-heading">
        <div className="cp-section-heading">
          <div>
            <span className="cp-section-kicker">Contribution mix</span>
            <h3 id="activity-heading">Activity snapshot</h3>
          </div>
          <span className="cp-section-total">{contributor.prs_worked} PR{contributor.prs_worked !== 1 ? 's' : ''}</span>
        </div>
        <div className="cp-activity-strip">
          <div><span className="cp-activity-dot cp-activity-dot--accept" /><strong>{contributor.accepts}</strong><small>Accepts</small></div>
          <div><span className="cp-activity-dot cp-activity-dot--modify" /><strong>{contributor.modifies}</strong><small>Modifies</small></div>
          <div><span className="cp-activity-dot cp-activity-dot--reject" /><strong>{contributor.rejects}</strong><small>Rejects</small></div>
        </div>
      </section>

      {contributor.rank_90d_oldest_activity && (
        <p className="cp-staleness-note"><span aria-hidden="true">↻</span>{' '}
          90-day rank updates after{' '}
          <strong>{fmtDate(contributor.rank_90d_oldest_activity)}</strong> drops out of the window.
        </p>
      )}
    </div>
  );
}

const RESPONSE_BADGE_ICONS: Record<ResponseBadge['id'], string> = {
  first_responder: '⚡',
  fast_responder: '⏱',
  coverage_contributor: '🛟',
};

function criterionValue(criterion: ResponseBadgeCriterion): string {
  const suffix = criterion.unit === 'percent' ? '%' : '';
  return `${criterion.current}${suffix} / ${criterion.target}${suffix}`;
}

function BadgesTab({ summary }: { summary: ResponseBadgeSummary }) {
  return (
    <div className="cp-tab-content cp-response-badges">
      <div className="cp-response-intro">
        <strong>Response recognition</strong>
        <span>Rewards timely coverage without changing reputation, ranking, vote weight, or permissions.</span>
      </div>

      <div className="cp-response-badge-list">
        {summary.badges.map(badge => (
          <article
            key={badge.id}
            className={`cp-response-badge-card cp-response-badge-card--${badge.state}`}
          >
            <div className="cp-response-badge-icon" aria-hidden="true">{RESPONSE_BADGE_ICONS[badge.id]}</div>
            <div className="cp-response-badge-body">
              <div className="cp-response-badge-heading">
                <h3>{badge.name}</h3>
                <span className={`cp-response-badge-state cp-response-badge-state--${badge.state}`}>
                  {badge.state === 'active' ? 'Earned' : 'Not yet earned'}
                </span>
              </div>
              <p>{badge.description}</p>
              <strong className="cp-response-badge-evidence">{badge.evidence}</strong>
              {(badge.kind === 'activity' || badge.state !== 'active') && (
                <div className="cp-response-criteria">
                  {badge.criteria.map(criterion => {
                    const progress = criterion.target > 0
                      ? Math.min(100, Math.round((criterion.current / criterion.target) * 100))
                      : 0;
                    return (
                      <div key={criterion.label} className="cp-response-criterion">
                        <span><small>{criterion.label}</small><b>{criterionValue(criterion)}</b></span>
                        <div
                          className={`cp-response-progress${criterion.met ? ' cp-response-progress--met' : ''}`}
                          role="progressbar"
                          aria-label={criterion.label}
                          aria-valuemin={0}
                          aria-valuemax={criterion.target}
                          aria-valuenow={Math.min(criterion.current, criterion.target)}
                        >
                          <span style={{ width: `${progress}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </article>
        ))}
      </div>

      <div className="cp-response-note">
        <strong>When does the clock start?</strong>
        <span>{summary.requestClockMeaning}</span>
        <span>Only recognized OASIS votes count. PR authors and historical requests are excluded.</span>
      </div>
    </div>
  );
}

function ContributionRow({ c, is90d }: { c: Contribution; is90d: boolean }) {
  const bonusTotal = c.early_mover_bonus + c.early_bird_bonus + c.influencer_bonus;
  return (
    <div className="cp-contribution-item">
      <div className="cp-contribution-header">
        <a href={c.pr_url} target="_blank" rel="noopener noreferrer" className="cp-contribution-title">
          {c.pr_title || `PR #${c.pr_number}`}
        </a>
        <DecisionBadge decision={c.decision} />
      </div>
      <div className="cp-contribution-meta">
        <span className="cp-contribution-repo">{c.repo_name}</span>
        <span className="cp-contribution-date">{fmtDate(c.commented_at)}</span>
        {c.merged_upstream === 1 && (
          <span className="cp-badge cp-badge--merged">merged upstream</span>
        )}
      </div>
      <div className="cp-contribution-scores">
        <span title="Peer score earned from reactions on this comment">
          peer: <strong>{fmt(c.peer_score_earned)}</strong>
        </span>
        {bonusTotal !== 0 && (
          <span title="Bonus factors: early-mover + early-bird + influencer">
            bonus: <strong>{fmt(bonusTotal, 3)}</strong>
          </span>
        )}
        {c.total_reactions > 0 && (
          <span title={`${c.positive_reactions} positive, ${c.negative_reactions} negative`}>
            {c.total_reactions} rxn
          </span>
        )}
        {is90d && <span className="cp-badge cp-badge--90d">90d</span>}
      </div>
    </div>
  );
}

function ContributionsTab({ contributions }: { contributions: Contribution[] }) {
  const now = Date.now();
  const cutoff90d = new Date(now - NINETY_DAYS_MS).toISOString();
  const recent = contributions.filter(c => c.commented_at >= cutoff90d);

  return (
    <div className="cp-tab-content cp-contributions-grid">
      <div className="cp-contributions-col">
        <h3 className="cp-contributions-col-title">All Time <span className="cp-count">({contributions.length})</span></h3>
        {contributions.length === 0
          ? <p className="cp-empty">No OASIS comments yet.</p>
          : contributions.map(c => <ContributionRow key={c.comment_id} c={c} is90d={c.commented_at >= cutoff90d} />)
        }
      </div>
      <div className="cp-contributions-col">
        <h3 className="cp-contributions-col-title">Last 90 Days <span className="cp-count">({recent.length})</span></h3>
        {recent.length === 0
          ? <p className="cp-empty">No activity in the last 90 days.</p>
          : recent.map(c => <ContributionRow key={c.comment_id} c={c} is90d />)
        }
      </div>
    </div>
  );
}

function FormulaTab() {
  return (
    <div className="cp-tab-content cp-formula">
      <h3>Reputation Formula</h3>
      <pre className="cp-formula-block">{`base_reputation = comment_score
                + peer_score
                + reaction_score
                + trust_score

modified_reputation = base_reputation × (1 + total_bonus)`}</pre>

      <h4>Score Components</h4>
      <dl className="cp-formula-dl">
        <dt>comment_score</dt>
        <dd>1 point per OASIS-template comment posted. Measures participation volume.</dd>

        <dt>peer_score</dt>
        <dd>
          Sum of <em>peer_agreement</em> over all reactions on your OASIS comments.<br />
          <code>peer_agreement = 0.25 (base) + 0.10 (positive) or −0.50 (negative)</code><br />
          Positive: +1, heart, hooray, rocket, laugh<br />
          Negative: −1, confused<br />
          Self-reactions and bot reactions excluded.
        </dd>

        <dt>reaction_score</dt>
        <dd>
          <code>min(reactions_given, 5) × 0.25</code> (max 1.25)<br />
          Counts reactions you gave on other people&apos;s OASIS comments. Capped at 5 to prevent farming.
        </dd>

        <dt>trust_score</dt>
        <dd>
          <code>10 × count(PRs where you voted &apos;accept&apos; AND merged upstream)</code><br />
          Rewards correctly identifying upstream-mergeable vulnerabilities.
        </dd>
      </dl>

      <h4>Bonus Factors</h4>
      <p>Bonuses are <em>multiplicative factors</em>, summed across all your OASIS comments, then applied to base_reputation.</p>

      <dl className="cp-formula-dl">
        <dt>early_mover_bonus (per comment)</dt>
        <dd>
          Only applied to PRs older than 72 hours at sync time.<br />
          N = total OASIS comments on the PR; rank by created_at ascending.<br />
          <code>Top max(1, floor(N×0.01)) ranks → +0.20</code><br />
          <code>Next floor(N×0.09) ranks → +0.10</code><br />
          <code>Next floor(N×0.15) ranks → +0.05</code>
        </dd>

        <dt>early_bird_bonus (per comment)</dt>
        <dd>
          Based on hours between PR creation and your comment.<br />
          <code>≤ 24h → +0.25 | 24h–96h → +0.10 | &gt;96h → 0</code>
        </dd>

        <dt>influencer_bonus (per PR)</dt>
        <dd>
          Per PR, one comment wins each title (ties go to earliest):<br />
          <code>Most total reactions → +0.10</code><br />
          <code>Most positive reactions → +0.20</code><br />
          <code>Most negative reactions → −0.50</code><br />
          A comment can hold multiple titles; bonuses stack.
        </dd>
      </dl>

      <h4>90-Day Rank</h4>
      <p>
        Same formula, restricted to OASIS comments and reactions posted within the last 90 days.
        Recalculated each cron sync. Your rank will next change when your oldest 90-day activity
        drops out of the window (shown on the Score tab).
      </p>
    </div>
  );
}

/* ─── SKELETON LOADER ─────────────────────────────────────────── */
function SkeletonScoreTab() {
  return (
    <div className="cp-tab-content">
      {/* Score table skeleton */}
      <div className="cp-skeleton cp-skeleton-table">
        <div className="cp-skeleton-table-row">
          <div className="cp-skeleton-label"><div className="cp-skeleton-block" style={{ width: '85%' }} /></div>
          <div className="cp-skeleton-value"><div className="cp-skeleton-block" /></div>
        </div>
        <div className="cp-skeleton-table-row">
          <div className="cp-skeleton-label"><div className="cp-skeleton-block" style={{ width: '75%' }} /></div>
          <div className="cp-skeleton-value"><div className="cp-skeleton-block" /></div>
        </div>
        <div className="cp-skeleton-table-row">
          <div className="cp-skeleton-label"><div className="cp-skeleton-block" style={{ width: '80%' }} /></div>
          <div className="cp-skeleton-value"><div className="cp-skeleton-block" /></div>
        </div>
        <div className="cp-skeleton-table-row">
          <div className="cp-skeleton-label"><div className="cp-skeleton-block" style={{ width: '90%' }} /></div>
          <div className="cp-skeleton-value"><div className="cp-skeleton-block" /></div>
        </div>
        <div className="cp-skeleton-table-row">
          <div className="cp-skeleton-label"><div className="cp-skeleton-block" style={{ width: '70%' }} /></div>
          <div className="cp-skeleton-value"><div className="cp-skeleton-block" /></div>
        </div>
        <div className="cp-skeleton-table-row">
          <div className="cp-skeleton-label"><div className="cp-skeleton-block" style={{ width: '95%' }} /></div>
          <div className="cp-skeleton-value"><div className="cp-skeleton-block" /></div>
        </div>
        <div className="cp-skeleton-table-row">
          <div className="cp-skeleton-label"><div className="cp-skeleton-block" style={{ width: '65%' }} /></div>
          <div className="cp-skeleton-value"><div className="cp-skeleton-block" /></div>
        </div>
      </div>

      {/* Rank summary skeleton */}
      <div className="cp-skeleton-rank-grid">
        <div className="cp-skeleton-rank-box">
          <div className="cp-skeleton-block" />
          <div className="cp-skeleton-block" />
        </div>
        <div className="cp-skeleton-rank-box">
          <div className="cp-skeleton-block" />
          <div className="cp-skeleton-block" />
        </div>
      </div>

      {/* Staleness note skeleton */}
      <div className="cp-skeleton cp-skeleton-note">
        <div className="cp-skeleton-block" style={{ width: '100%' }} />
        <div className="cp-skeleton-block" style={{ width: '90%' }} />
      </div>
    </div>
  );
}

/* ─── MAIN COMPONENT ──────────────────────────────────────────── */
interface Props {
  login: string | null;
  onClose: () => void;
}

export default function ContributorPanel({ login, onClose }: Props) {
  const [data, setData] = useState<PanelData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>('score');
  const [open, setOpen] = useState(false);

  const doClose = useCallback(() => {
    setOpen(false);
    setTimeout(onClose, 280); // match CSS transition duration
  }, [onClose]);

  // Keyboard: Escape to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') doClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [doClose]);

  // Fetch data when login changes
  useEffect(() => {
    if (!login) { setOpen(false); setData(null); return; }
    setLoading(true);
    setError(null);
    setActiveTab('score');
    setOpen(true); // Open panel immediately with skeleton
    fetch(`/api/contributors/${encodeURIComponent(login)}`)
      .then(r => r.json())
      .then((d: PanelData) => { setData(d); setLoading(false); })
      .catch(() => { setError('Failed to load contributor data.'); setLoading(false); });
  }, [login]);

  if (!login) return null;

  const contributor = data?.contributor;

  return (
    <>
      <div className="cp-backdrop" onClick={doClose} aria-hidden />
      <aside className={`cp-panel${open ? ' cp-panel--open' : ''}`} aria-label="Contributor detail">
        {/* Header */}
        <div className="cp-header">
          <ContributorAvatar login={login} src={contributor?.avatar_url} className="cp-avatar" size={34} />
          <span className="cp-login">{login}</span>
          {data && (
            <>
              <span className="cp-rank-badge cp-rank-badge--alltime">#{data.allTimeRank} All Time</span>
              {contributor?.rank_90d != null && (
                <span className="cp-rank-badge cp-rank-badge--90d">#{contributor.rank_90d} 90-Day</span>
              )}
            </>
          )}
          <span className="cp-header-spacer" />
          <a
            href={`https://github.com/${login}`}
            target="_blank"
            rel="noopener noreferrer"
            className="cp-gh-link"
          >
            GitHub
          </a>
          <button className="cp-close" onClick={doClose} aria-label="Close panel">×</button>
        </div>

        {/* Tab bar */}
        <div className="cp-tab-bar" role="tablist">
          {(['score', 'badges', 'contributions', 'formula'] as ActiveTab[]).map(tab => (
            <button
              key={tab}
              role="tab"
              aria-selected={activeTab === tab}
              className={`cp-tab${activeTab === tab ? ' cp-tab--active' : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* Content */}
        {loading && <SkeletonScoreTab />}
        {error   && <div className="cp-error">{error}</div>}
        {!loading && !error && data && contributor && (
          <>
            {activeTab === 'score'         && (
              <ScoreTab
                contributor={contributor}
                allTimeRank={data.allTimeRank}
                onShowFormula={() => setActiveTab('formula')}
              />
            )}
            {activeTab === 'badges'        && <BadgesTab summary={data.responseBadges} />}
            {activeTab === 'contributions' && <ContributionsTab contributions={data.contributions} />}
            {activeTab === 'formula'       && <FormulaTab />}
          </>
        )}
      </aside>
    </>
  );
}
