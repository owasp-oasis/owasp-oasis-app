import type { Env } from '../types.js';
import type { DashboardData, DashboardProject, DashboardTotals } from '../dashboardTypes.js';
import { jsonErr, jsonOk } from '../security.js';

// Match Workspace eligibility and status precedence; aggregate the whole collection,
// never the limited /api/workspace/prs result. No user identifiers leave D1.
const CURRENT = `WITH current_prs AS (
  SELECT p.*, CASE
    WHEN p.state = 'closed' AND p.merged_upstream = 1 THEN 'Upstream accepted'
    WHEN p.state = 'closed' THEN 'Closed'
    WHEN p.participants >= 10 AND p.consensus_accept + p.consensus_modify + p.consensus_reject > 0
      AND 1.0 * p.consensus_accept / (p.consensus_accept + p.consensus_modify + p.consensus_reject) >= .75
      THEN 'Community trusted'
    ELSE 'Needs review' END AS dashboard_status
  FROM pull_requests p JOIN repos r ON r.id = p.repo_id
  WHERE p.deleted = 0 AND r.active = 1
)`;
const STATUS_COUNTS = `COUNT(*) AS candidates,
  COALESCE(SUM(dashboard_status = 'Needs review'), 0) AS needs_review,
  COALESCE(SUM(dashboard_status = 'Community trusted'), 0) AS trusted,
  COALESCE(SUM(dashboard_status = 'Upstream accepted'), 0) AS accepted,
  COALESCE(SUM(dashboard_status = 'Closed'), 0) AS closed`;
const VALID_VOTE = "v.decision IN ('accept', 'modify', 'reject', 'duplicate')";
const DAY = 86_400_000;
const isoDate = (time: number) => new Date(time).toISOString().slice(0, 10);

export async function handleRegistrationCount(env: Env, request: Request): Promise<Response> {
  try {
    if (!env.DB) throw new Error('Database unavailable');
    const row = await env.DB.prepare('SELECT COUNT(*) AS count FROM registrations').first<{ count: number }>();
    if (!row) throw new Error('Missing count');
    return jsonOk({ count: row.count }, request, { cache: 'no-store' });
  } catch {
    console.error(JSON.stringify({ event: 'registration_count_unavailable' }));
    return jsonErr('Registration count is temporarily unavailable.', 503, request);
  }
}

export async function handleDashboard(env: Env, request: Request): Promise<Response> {
  const range = new URL(request.url).searchParams.get('range') ?? '90';
  if (range !== '30' && range !== '90' && range !== 'all') return jsonErr('Invalid dashboard range', 400, request);
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const tomorrow = isoDate(today + DAY);
  const activeFrom = isoDate(today - 89 * DAY);
  const activityFrom = isoDate(today - 83 * DAY);
  const rangeFrom = range === 'all' ? '0001-01-01' : isoDate(today - (Number(range) - 1) * DAY);
  try {
    // The batch gives one snapshot, with bounded trend/activity/recent-fix output.
    const result = await env.DB.batch<Record<string, unknown>>([
      env.DB.prepare(`${CURRENT} SELECT ${STATUS_COUNTS},
        (SELECT COUNT(*) FROM repos WHERE active = 1) AS projects,
        (SELECT COUNT(*) FROM registrations) AS registrations FROM current_prs`),
      env.DB.prepare(`SELECT COUNT(*) AS votes,
        COALESCE(SUM(v.decision = 'accept'), 0) AS accept,
        COALESCE(SUM(v.decision = 'modify'), 0) AS modify,
        COALESCE(SUM(v.decision = 'reject'), 0) AS reject,
        COALESCE(SUM(v.decision = 'duplicate'), 0) AS duplicate,
        COUNT(DISTINCT CASE WHEN date(v.voted_at) >= ? AND date(v.voted_at) < ? THEN v.github_login END) AS active_reviewers_90d
        FROM user_votes v WHERE ${VALID_VOTE}`)
        .bind(activeFrom, tomorrow),
      env.DB.prepare(`${CURRENT} SELECT r.id, r.name, COUNT(p.id) AS candidates,
        COALESCE(SUM(p.dashboard_status = 'Needs review'), 0) AS needs_review,
        COALESCE(SUM(p.dashboard_status = 'Community trusted'), 0) AS trusted,
        COALESCE(SUM(p.dashboard_status = 'Upstream accepted'), 0) AS accepted,
        COALESCE(SUM(p.dashboard_status = 'Closed'), 0) AS closed
        FROM repos r LEFT JOIN current_prs p ON p.repo_id = r.id
        WHERE r.active = 1
        GROUP BY r.id ORDER BY candidates DESC, r.name COLLATE NOCASE, r.id`),
      env.DB.prepare(`${CURRENT}, bounds AS (
        SELECT COALESCE(MIN(date(created_at)), ?) AS first_date FROM current_prs
        WHERE date(created_at) >= ? AND date(created_at) < ?
      ), ticks(n) AS (VALUES (0),(1),(2),(3),(4),(5),(6),(7),(8),(9),(10),(11)),
      boundaries AS (
        SELECT n, date(?, '+' || CAST(ROUND(n * (julianday(?) - julianday(?)) / 11) AS INTEGER) || ' days') AS day
        FROM ticks WHERE ? != 'all'
        UNION ALL
        SELECT n, date(first_date, '+' || CAST(ROUND(n * (julianday(?) - julianday(first_date)) / 11) AS INTEGER) || ' days') AS day
        FROM ticks, bounds WHERE ? = 'all'
      ) SELECT b.day AS date, COUNT(p.id) AS count
        FROM boundaries b LEFT JOIN current_prs p
          ON date(p.created_at) >= ? AND date(p.created_at) <= b.day
        GROUP BY b.n, b.day ORDER BY b.n`)
        .bind(isoDate(today), rangeFrom, tomorrow, rangeFrom, isoDate(today), rangeFrom, range, isoDate(today), range, rangeFrom),
      env.DB.prepare(`SELECT date(v.voted_at) AS date, COUNT(*) AS votes
        FROM user_votes v
        WHERE ${VALID_VOTE} AND date(v.voted_at) >= ? AND date(v.voted_at) < ?
        GROUP BY date(v.voted_at) ORDER BY date`).bind(activityFrom, tomorrow),
      env.DB.prepare(`${CURRENT} SELECT id, repo_name, number, title, dashboard_status AS status, updated_at
        FROM current_prs ORDER BY updated_at DESC, id DESC LIMIT 10`),
      env.DB.prepare("SELECT key, value FROM sync_state WHERE key IN ('last_synced_at', 'sync_running')"),
    ]);
    if (result.some(row => !row.success)) throw new Error('Incomplete dashboard query');
    const state = Object.fromEntries(result[6].results.map(row => [String(row.key), row.value]));
    const activity = new Map(result[4].results.map(row => [String(row.date), Number(row.votes)]));
    const points = result[3].results as DashboardData['trend']['points'];
    const payload: DashboardData = {
      ok: true, generated_at: now.toISOString(),
      last_synced_at: typeof state.last_synced_at === 'string' && Number.isFinite(Date.parse(state.last_synced_at)) && Date.parse(state.last_synced_at) > Date.parse('2020-01-01') ? state.last_synced_at : null,
      sync_running: state.sync_running === '1',
      totals: { ...result[0].results[0], ...result[1].results[0] } as unknown as DashboardTotals,
      projects: result[2].results as unknown as DashboardProject[],
      trend: { range, from: points[0].date, to: isoDate(today), points },
      activity: { from: activityFrom, to: isoDate(today), days: Array.from({ length: 84 }, (_, i) => {
        const date = isoDate(today - (83 - i) * DAY);
        return { date, votes: activity.get(date) ?? 0 };
      }) },
      recent_fixes: result[5].results as unknown as DashboardData['recent_fixes'],
    };
    return jsonOk(payload as unknown as Record<string, unknown>, request, { cache: 'public, max-age=60' });
  } catch {
    console.error(JSON.stringify({ event: 'public_dashboard_unavailable' }));
    return jsonErr('Dashboard data is temporarily unavailable. Please try again.', 503, request);
  }
}
