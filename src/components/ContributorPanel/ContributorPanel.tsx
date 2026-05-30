/**
 * ContributorPanel — slide-out detail panel for a single OASIS contributor.
 *
 * Triggered from ContributorsTab when a row is clicked.
 * Fetches from GET /api/contributors/:login and renders three tabs:
 *   Score       — full score breakdown (comment, peer, reaction, trust, bonuses → modified rep)
 *   Contributions — all-time vs 90-day side-by-side list of OASIS comments
 *   Formula     — static explanation of the reputation formula
 */

import { useEffect, useState, useCallback } from 'react';
import './ContributorPanel.css';

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

interface PanelData {
  contributor: ContributorDetail;
  allTimeRank: number;
  contributions: Contribution[];
}

type ActiveTab = 'score' | 'contributions' | 'formula';

/* ─── HELPERS ─────────────────────────────────────────────────── */
const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

function fmt(n: number, decimals = 2): string {
  return n.toFixed(decimals).replace(/\.?0+$/, '') || '0';
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

function ScoreRow({ label, value, note, highlight }: {
  label: string; value: number | string; note?: string; highlight?: boolean
}) {
  return (
    <tr className={highlight ? 'cp-score-row--highlight' : ''}>
      <td className="cp-score-label">{label}</td>
      <td className="cp-score-value">{typeof value === 'number' ? fmt(value) : value}</td>
      {note && <td className="cp-score-note">{note}</td>}
    </tr>
  );
}

/* ─── SUB-COMPONENTS ──────────────────────────────────────────── */
function ScoreTab({ contributor, allTimeRank }: { contributor: ContributorDetail; allTimeRank: number }) {
  const totalBonus = contributor.modified_reputation > 0 && contributor.base_reputation > 0
    ? (contributor.modified_reputation / contributor.base_reputation - 1)
    : 0;

  return (
    <div className="cp-tab-content">
      <table className="cp-score-table">
        <thead>
          <tr>
            <th>Component</th>
            <th>Score</th>
            <th>Notes</th>
          </tr>
        </thead>
        <tbody>
          <ScoreRow
            label="OASIS Comments"
            value={contributor.comment_score}
            note={`${contributor.total_interactions} comment${contributor.total_interactions !== 1 ? 's' : ''} posted`}
          />
          <ScoreRow
            label="Peer Agreement"
            value={contributor.peer_score}
            note={`${contributor.reactions_received} reaction${contributor.reactions_received !== 1 ? 's' : ''} received`}
          />
          <ScoreRow
            label="Reactions Given"
            value={contributor.reaction_score}
            note={`${contributor.reactions_given} given (capped at 5 × 0.25)`}
          />
          <ScoreRow
            label="Trust Score"
            value={contributor.trust_score}
            note={contributor.trust_score > 0 ? `${contributor.accepts} accept vote${contributor.accepts !== 1 ? 's' : ''} on upstream-merged PRs` : '—'}
          />
          <tr className="cp-score-subtotal">
            <td colSpan={3}>
              <span className="cp-score-subtotal-label">Base Reputation</span>
              <span className="cp-score-subtotal-value">{fmt(contributor.base_reputation)}</span>
            </td>
          </tr>
          <ScoreRow
            label="Bonus Factors"
            value={`× ${fmt(1 + totalBonus, 4)}`}
            note="early-mover + early-bird + influencer"
          />
          <tr className="cp-score-total">
            <td className="cp-score-total-label">Modified Reputation</td>
            <td className="cp-score-total-value" colSpan={2}>{fmt(contributor.modified_reputation)}</td>
          </tr>
        </tbody>
      </table>

      <div className="cp-rank-summary">
        <div className="cp-rank-item">
          <span className="cp-rank-label">All-Time Rank</span>
          <span className="cp-rank-value">#{allTimeRank}</span>
        </div>
        {contributor.rank_90d != null && (
          <div className="cp-rank-item">
            <span className="cp-rank-label">90-Day Rank</span>
            <span className="cp-rank-value">#{contributor.rank_90d}</span>
          </div>
        )}
        <div className="cp-rank-item">
          <span className="cp-rank-label">PRs Worked</span>
          <span className="cp-rank-value">{contributor.prs_worked}</span>
        </div>
        <div className="cp-rank-item">
          <span className="cp-rank-label">Accepts</span>
          <span className="cp-rank-value">{contributor.accepts}</span>
        </div>
        <div className="cp-rank-item">
          <span className="cp-rank-label">Modifies</span>
          <span className="cp-rank-value">{contributor.modifies}</span>
        </div>
        <div className="cp-rank-item">
          <span className="cp-rank-label">Rejects</span>
          <span className="cp-rank-value">{contributor.rejects}</span>
        </div>
      </div>

      {contributor.rank_90d_oldest_activity && (
        <p className="cp-staleness-note">
          90-day rank next recalculated after{' '}
          <strong>{fmtDate(contributor.rank_90d_oldest_activity)}</strong> drops out of the window.
        </p>
      )}
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
    fetch(`/api/contributors/${encodeURIComponent(login)}`)
      .then(r => r.json())
      .then((d: PanelData) => { setData(d); setLoading(false); setOpen(true); })
      .catch(() => { setError('Failed to load contributor data.'); setLoading(false); });
  }, [login]);

  if (!login) return null;

  const contributor = data?.contributor;
  const avatarUrl = contributor?.avatar_url ?? `https://github.com/${login}.png?size=64`;

  return (
    <>
      <div className="cp-backdrop" onClick={doClose} aria-hidden />
      <aside className={`cp-panel${open ? ' cp-panel--open' : ''}`} aria-label="Contributor detail">
        {/* Header */}
        <div className="cp-header">
          <img src={avatarUrl} alt={`${login} avatar`} className="cp-avatar" width={32} height={32} />
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
          {(['score', 'contributions', 'formula'] as ActiveTab[]).map(tab => (
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
        {loading && <div className="cp-loading">Loading…</div>}
        {error   && <div className="cp-error">{error}</div>}
        {!loading && !error && data && contributor && (
          <>
            {activeTab === 'score'         && <ScoreTab contributor={contributor} allTimeRank={data.allTimeRank} />}
            {activeTab === 'contributions' && <ContributionsTab contributions={data.contributions} />}
            {activeTab === 'formula'       && <FormulaTab />}
          </>
        )}
      </aside>
    </>
  );
}
