/**
 * GitHub API client, comment/PR body parsers, and bot detection.
 */

/* ─── CONSTANTS ──────────────────────────────────────────────── */
export const ORG        = 'owasp-oasis';
export const META_REPOS = new Set(['project-overview', 'project-planning', 'project-website']);

export const BOT_TO_TOOL: Record<string, string> = {
  'appsecai-app[bot]':    'AppSecAI',
  'appsecai-bot':         'AppSecAI',
  'dryrun-bot':           'DryRun Security',
  'dryrun-security':      'DryRun Security',
  'dryrun-security[bot]': 'DryRun Security',
};

/**
 * Maps known bot logins to their OASIS validator tool name.
 * Validator tools post OASIS-template comments (accept/modify/reject decisions)
 * on tracked PRs — they play the same role as human validators.
 * DryRun Security has a separate validator bot (dryrun-security[bot]) that is
 * configured on repos in the OASIS project.
 */
export const BOT_TO_VALIDATOR_TOOL: Record<string, string> = {
  'dryrun-security[bot]': 'DryRun Security',
};

/* ─── REACTION POLARITY ──────────────────────────────────────── */
/**
 * Positive reactions: indicate agreement, praise, or enthusiasm.
 * peer_agreement = base_modifier(0.25) + positive_modifier(0.10)
 */
export const POSITIVE_REACTIONS = new Set(['+1', 'heart', 'hooray', 'rocket', 'laugh']);

/**
 * Negative reactions: indicate disagreement or confusion.
 * peer_agreement = base_modifier(0.25) + negative_modifier(-0.50) = -0.25
 */
export const NEGATIVE_REACTIONS = new Set(['-1', 'confused']);

/**
 * Returns the polarity of a GitHub reaction content string.
 * Neutral reactions (e.g. 'eyes') are tracked but contribute only the base_modifier(0.25).
 */
export function reactionPolarity(content: string): 'positive' | 'negative' | 'neutral' {
  if (POSITIVE_REACTIONS.has(content)) return 'positive';
  if (NEGATIVE_REACTIONS.has(content)) return 'negative';
  return 'neutral';
}

/* ─── GITHUB API TYPES ───────────────────────────────────────── */
export interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  language: string | null;
  stargazers_count: number;
  fork: boolean;
  parent?: { html_url: string };
}

export interface GitHubPR {
  id: number;
  number: number;
  title: string;
  state: string;
  html_url: string;
  body: string | null;
  head?: { sha?: string };
  merged_at?: string | null;
  created_at: string;
  updated_at: string;
  user?: { login?: string };
}

export interface GitHubComment {
  id: number;
  body: string | null;
  user?: { login?: string };
  created_at: string;  // ISO-8601 timestamp when the comment was posted
}

export interface GitHubReaction {
  content: string;
  user?: { login?: string };
}

/* ─── HTTP CLIENT ────────────────────────────────────────────── */
export async function ghFetch<T = unknown>(path: string, token: string): Promise<T> {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'oasis-worker-sync/1.0',
    },
  });
  if (!res.ok) throw new Error(`GitHub API ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

export async function ghFetchAll<T = unknown>(path: string, token: string): Promise<T[]> {
  const results: T[] = [];
  let page = 1;
  while (true) {
    const sep  = path.includes('?') ? '&' : '?';
    const data = await ghFetch<T[]>(`${path}${sep}per_page=100&page=${page}`, token);
    if (!Array.isArray(data) || data.length === 0) break;
    results.push(...data);
    if (data.length < 100) break;
    page++;
  }
  return results;
}

/* ─── PARSERS ────────────────────────────────────────────────── */
export function parseDecision(body: string | null): 'accept' | 'modify' | 'reject' | 'duplicate' | null {
  if (!body) return null;
  const lower = body.toLowerCase();
  if (!lower.includes('validation summary:') && !lower.includes('rejection summary:') && !lower.includes('duplicate report:')) return null;
  if (lower.includes('duplicate report:') && lower.includes('duplicate')) return 'duplicate';
  if (lower.includes('rejection summary:') && lower.includes('reject')) return 'reject';
  if (lower.includes('validation summary:')) {
    for (const line of body.split('\n')) {
      const l = line.toLowerCase();
      if (l.includes('decision')) {
        if (l.includes('accept')) return 'accept';
        if (l.includes('modify')) return 'modify';
        if (l.includes('reject')) return 'reject';
      }
    }
  }
  return null;
}

/**
 * Parses the Parent PR number from a Duplicate report comment.
 * Looks for the "Parent PR" row in the markdown table and extracts the PR number.
 * Handles formats: #123, https://github.com/.../pull/123, plain 123
 * Returns the PR number (integer) or null if not found.
 */
export function parseDuplicateParent(body: string | null): number | null {
  if (!body) return null;
  const lower = body.toLowerCase();
  if (!lower.includes('duplicate report:')) return null;
  
  // Look for "Parent PR" row in the table
  const lines = body.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].toLowerCase();
    if (line.includes('parent pr') || line.includes('parent')) {
      // This might be the row with the PR reference
      // Check the next few lines for a PR number in case formatting varies
      const rowAndNext = (lines[i] + ' ' + (lines[i + 1] ?? '')).toLowerCase();
      
      // Try to extract PR number from various formats
      // Format 1: #123
      const match1 = rowAndNext.match(/#(\d+)/);
      if (match1) return parseInt(match1[1], 10);
      
      // Format 2: /pull/123 or /pull/123)
      const match2 = rowAndNext.match(/\/pull\/(\d+)/i);
      if (match2) return parseInt(match2[1], 10);
      
      // Format 3: plain number
      const match3 = rowAndNext.match(/\|\s*(\d+)\s*\|/);
      if (match3) return parseInt(match3[1], 10);
    }
  }
  
  return null;
}

export function parseDetectionTool(body: string | null): string | null {
  if (!body) return null;
  const m = body.match(/\*\*[Dd]etected\s+[Bb]y[:\*]+\*?\*?\s*([^\n*|]+)/);
  if (m) return normaliseToolName(m[1]);
  if (/appsecai-diff-hash/i.test(body) || /AppSecAI Vulnerability ID/i.test(body)) return 'AppSecAI';
  if (/[Dd]etected\s+[Bb]y[:\s]+AppSec\s*AI/i.test(body)) return 'AppSecAI';
  if (/Semgrep\s+OSS/i.test(body)) return 'Semgrep OSS';
  if (/OpenGrep/i.test(body)) return 'OpenGrep';
  if (/\b(javascript|python|java|go|ruby)\.[a-z]+\.[a-z]+\.[a-z]/.test(body)) return 'Semgrep OSS';
  if (/##\s+What\s+SAST\s+Found/i.test(body)) return 'SAST (unknown)';
  return null;
}

export function normaliseToolName(raw: string): string {
  const l = raw.trim().toLowerCase();
  if (l.includes('appsec') || l.includes('fenix')) return 'AppSecAI';
  if (l.includes('opengrep')) return 'OpenGrep';
  if (l.includes('semgrep')) return 'Semgrep OSS';
  // Bandit findings often include the individual rule in the Detected By
  // value (for example, "Bandit (B602)" or "Bandit (rule B104)"). Rules are
  // findings produced by Bandit, not separate tools.
  if (/^bandit(?:\s|\(|$)/.test(l)) return 'Bandit';
  return raw.trim().slice(0, 60) || 'SAST (unknown)';
}

/* ─── UPSTREAM MERGE DETECTION ──────────────────────────────── */
/**
 * Checks whether a given commit SHA exists in an upstream (parent) repository.
 * Used to determine whether an OASIS-tracked PR's head commit was eventually
 * merged into the upstream, which awards trust_score bonuses to contributors
 * who voted 'accept' on that PR.
 *
 * Returns true  → commit found in upstream (merged_upstream = 1)
 * Returns false → 404 or any error (keep existing merged_upstream value)
 *
 * TODO (Option 3): Improve detection to handle squash-merge, rebase, and cherry-pick scenarios.
 * Current implementation only finds exact SHA matches. Future enhancement should:
 *   1. Check GitHub PR merge status via GET /pulls/{n}/merge for direct merge confirmation
 *   2. Search upstream by commit tree hash (content-based matching) rather than SHA
 *   3. Cross-reference upstream commits by message patterns or author metadata
 * This would reduce "Withdrawn" misclassifications for legitimate upstream merges with different SHAs.
 */
export async function isHeadMergedUpstream(
  upstreamOwner: string,
  upstreamRepo: string,
  headSha: string,
  token: string,
): Promise<boolean> {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${upstreamOwner}/${upstreamRepo}/commits/${headSha}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'oasis-worker-sync/1.0',
        },
      },
    );
    return res.status === 200;
  } catch {
    return false; // network error — treat as not found, preserve existing value
  }
}

/**
 * TODO: Track PR closure actor via GitHub Issues Events API.
 * Future enhancement to support: GET /repos/{org}/{repo}/issues/{pr_number}/events
 * 
 * This would allow distinguishing between:
 *   - Author self-closing the PR (withdrawal)
 *   - Maintainer closing the PR (acceptance/rejection decision)
 *   - Bot auto-closing (duplicate, etc.)
 *
 * New DB fields: closed_by (actor login), closed_at (timestamp)
 *
 * Use case: Refine "Withdrawn" classification to consider who made the closure decision.
 * An author self-close with no accept votes = likely rejected.
 * A maintainer close with accept votes = likely accepted upstream.
 */

/**
 * Parses "owner" and "repo" from a GitHub HTML URL.
 * e.g. "https://github.com/nicowillis/owasp-top10" → { owner: 'nicowillis', repo: 'owasp-top10' }
 * Returns null if the URL cannot be parsed.
 */
export function parseGitHubUrl(url: string): { owner: string; repo: string } | null {
  try {
    const u = new URL(url);
    if (u.hostname !== 'github.com') return null;
    const parts = u.pathname.replace(/^\//, '').split('/');
    if (parts.length < 2) return null;
    return { owner: parts[0], repo: parts[1] };
  } catch {
    return null;
  }
}

/* ─── BOT DETECTION ──────────────────────────────────────────── */

/**
 * Validator bots are a special class of automated account: they post OASIS-template
 * comments with real accept/modify/reject decisions on tracked PRs, just like human
 * validators. They must be allowed through the isAutomatedAccount() guard in sync so
 * their pr_comments rows are written; they are excluded from pr_participants and
 * contributors tracking.
 */
export const VALIDATOR_BOT_LOGINS = new Set(Object.keys(BOT_TO_VALIDATOR_TOOL));

export function isValidatorBot(login: string | undefined | null): boolean {
  if (!login) return false;
  return VALIDATOR_BOT_LOGINS.has(login);
}

// Detect automated/bot accounts that should not appear in OASIS tracking.
// Checks both the [bot] GitHub suffix and common patterns in the login name.
export function isAutomatedAccount(login: string | undefined | null): boolean {
  if (!login) return true;
  const l = login.toLowerCase();
  return (
    login.endsWith('[bot]')       ||
    l.includes('bot')             ||
    l.includes('ci')              ||
    l.includes('auto')            ||
    l.includes('deploy')          ||
    l.includes('release')         ||
    l.includes('dependabot')      ||
    l.includes('renovate')        ||
    l.includes('stale')           ||
    l.includes('codecov')         ||
    l.includes('coveralls')       ||
    l.includes('imgbot')          ||
    l.includes('allcontributors') ||
    l.includes('snyk')            ||
    l.includes('sonar')
  );
}
