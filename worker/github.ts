/**
 * GitHub API client, comment/PR body parsers, and bot detection.
 */

/* ─── CONSTANTS ──────────────────────────────────────────────── */
export const ORG        = 'owasp-oasis';
export const META_REPOS = new Set(['project-overview', 'project-planning', 'project-website']);

export const BOT_TO_TOOL: Record<string, string> = {
  'appsecai-app[bot]': 'AppSecAI',
  'appsecai-bot':      'AppSecAI',
  'dryrun-bot':        'DryRun Security',
  'dryrun-security':   'DryRun Security',
};

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
export function parseDecision(body: string | null): 'accept' | 'modify' | 'reject' | null {
  if (!body) return null;
  const lower = body.toLowerCase();
  if (!lower.includes('validation summary:') && !lower.includes('rejection summary:')) return null;
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
  return raw.trim().slice(0, 60) || 'SAST (unknown)';
}

/* ─── BOT DETECTION ──────────────────────────────────────────── */
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
