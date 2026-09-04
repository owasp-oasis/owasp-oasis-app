import {
  recordEngagementEvent,
  recordPageView,
  runAnalyticsCollector,
  type EngagementEventType,
} from '../analytics.js';
import { getRequestPrincipal, recordPrivilegedAction, roleAllows } from '../authorization.js';
import { jsonErr, jsonOk, validateCSRF } from '../security.js';
import type { Env } from '../types.js';
import { hashString, parseBody } from '../validation.js';

const EVENT_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ANALYTICS_RATE_LIMIT = 120;
const ANALYTICS_RATE_WINDOW_SECONDS = 60;
const MAX_RANGE_DAYS = 400;
const PRIVACY_MIN_CONTRIBUTORS = 5;

interface SiteSummaryRow {
  page_views: number | null;
  navigation_count: number | null;
  load_ms_sum: number | null;
  response_4xx: number | null;
  response_5xx: number | null;
}

interface EngagementSummaryRow {
  review_opens: number | null;
  review_closes: number | null;
  active_seconds: number | null;
  votes_submitted: number | null;
}

function isDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
    && new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value;
}

function daysBetween(from: string, to: string): number {
  return Math.floor((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
}

function shiftDate(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function bucketExpression(granularity: string, column: string): string {
  if (granularity === 'week') return `strftime('%Y-%W', ${column})`;
  if (granularity === 'month') return `substr(${column}, 1, 7)`;
  return column;
}

async function withinTelemetryRateLimit(request: Request, env: Env): Promise<boolean> {
  if (!env.RATE_KV) return true;
  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  const key = `analytics:${await hashString(ip)}`;
  try {
    const count = Number.parseInt(await env.RATE_KV.get(key) ?? '0', 10);
    if (Number.isFinite(count) && count >= ANALYTICS_RATE_LIMIT) return false;
    await env.RATE_KV.put(key, String((Number.isFinite(count) ? count : 0) + 1), {
      expirationTtl: ANALYTICS_RATE_WINDOW_SECONDS,
    });
  } catch {
    // Telemetry must never prevent use of the application.
  }
  return true;
}

export async function handleAnalyticsPageView(request: Request, env: Env): Promise<Response> {
  if (!validateCSRF(request)) return jsonErr('Invalid security token', 403, request);
  if (env.ENVIRONMENT === 'preview') return jsonOk({ recorded: false }, request, { cache: 'no-store' });
  if (!await withinTelemetryRateLimit(request, env)) return jsonErr('Analytics rate limit exceeded', 429, request);
  const parsed = await parseBody(request);
  if (!parsed.ok) return jsonErr(parsed.error, parsed.status ?? 400, request);
  const eventId = typeof parsed.val.event_id === 'string' ? parsed.val.event_id : '';
  const path = typeof parsed.val.path === 'string' ? parsed.val.path : '';
  const loadMs = typeof parsed.val.load_ms === 'number' && Number.isFinite(parsed.val.load_ms)
    ? parsed.val.load_ms
    : null;
  const responseStatus = typeof parsed.val.response_status === 'number'
    && Number.isInteger(parsed.val.response_status)
    ? parsed.val.response_status
    : null;
  if (!EVENT_ID_RE.test(eventId)) return jsonErr('Invalid analytics event ID', 400, request);
  if (!path.startsWith('/') || path.length > 200) return jsonErr('Invalid analytics path', 400, request);
  if (loadMs !== null && (loadMs < 0 || loadMs > 120_000)) return jsonErr('Invalid navigation duration', 400, request);
  if (responseStatus !== null && (responseStatus < 100 || responseStatus > 599)) {
    return jsonErr('Invalid response status', 400, request);
  }
  const result = await recordPageView(env.DB, { eventId, path, loadMs, responseStatus });
  return jsonOk(result, request, { cache: 'no-store' });
}

export async function handleAnalyticsEngagement(request: Request, env: Env): Promise<Response> {
  if (!validateCSRF(request)) return jsonErr('Invalid security token', 403, request);
  if (env.ENVIRONMENT === 'preview') return jsonOk({ recorded: false }, request, { cache: 'no-store' });
  const principal = await getRequestPrincipal(request, env);
  if (!principal.session) return jsonErr('Authentication required', 401, request);
  if (!await withinTelemetryRateLimit(request, env)) return jsonErr('Analytics rate limit exceeded', 429, request);
  const parsed = await parseBody(request);
  if (!parsed.ok) return jsonErr(parsed.error, parsed.status ?? 400, request);
  const eventId = typeof parsed.val.event_id === 'string' ? parsed.val.event_id : '';
  const prId = typeof parsed.val.pr_id === 'number' && Number.isSafeInteger(parsed.val.pr_id)
    ? parsed.val.pr_id
    : 0;
  const type = parsed.val.type;
  const activeSeconds = typeof parsed.val.active_seconds === 'number' && Number.isFinite(parsed.val.active_seconds)
    ? parsed.val.active_seconds
    : 0;
  if (!EVENT_ID_RE.test(eventId)) return jsonErr('Invalid analytics event ID', 400, request);
  if (prId <= 0) return jsonErr('Invalid pull request ID', 400, request);
  if (type !== 'review_opened' && type !== 'review_heartbeat' && type !== 'review_closed') {
    return jsonErr('Invalid engagement event type', 400, request);
  }
  if (type === 'review_heartbeat' && (activeSeconds < 1 || activeSeconds > 60)) {
    return jsonErr('Active interval must be between 1 and 60 seconds', 400, request);
  }
  const result = await recordEngagementEvent(env.DB, {
    eventId,
    prId,
    type: type as EngagementEventType,
    activeSeconds,
  });
  if (result.repoId === null) return jsonErr('Pull request not found', 404, request);
  return jsonOk({ recorded: result.recorded }, request, { cache: 'no-store' });
}

async function requireAdmin(request: Request, env: Env) {
  const principal = await getRequestPrincipal(request, env);
  if (!principal.session) return { error: jsonErr('Authentication required', 401, request), principal };
  if (!roleAllows(principal.role, 'admin')) {
    return { error: jsonErr('Admin role required', 403, request), principal };
  }
  return { error: null, principal };
}

export async function handleAdminAnalytics(request: Request, env: Env): Promise<Response> {
  const authorization = await requireAdmin(request, env);
  if (authorization.error) return authorization.error;
  const url = new URL(request.url);
  const yesterday = shiftDate(new Date().toISOString().slice(0, 10), -1);
  const defaultFrom = shiftDate(yesterday, -29);
  const from = url.searchParams.get('from') ?? defaultFrom;
  const to = url.searchParams.get('to') ?? yesterday;
  const granularity = url.searchParams.get('granularity') ?? 'day';
  if (!isDate(from) || !isDate(to) || from > to) return jsonErr('Invalid analytics date range', 400, request);
  const rangeDays = daysBetween(from, to);
  if (rangeDays > MAX_RANGE_DAYS) return jsonErr(`Date range cannot exceed ${MAX_RANGE_DAYS} days`, 400, request);
  if (!['day', 'week', 'month'].includes(granularity)) return jsonErr('Invalid analytics granularity', 400, request);
  const previousTo = shiftDate(from, -1);
  const previousFrom = shiftDate(previousTo, -(rangeDays - 1));
  const siteBucket = bucketExpression(granularity, 'metric_date');
  const cloudflareBucket = bucketExpression(granularity, 'metric_date');
  const engagementBucket = bucketExpression(granularity, 'metric_date');

  try {
    const [
      siteSeries, routeTotals, siteCurrent, sitePrevious, cloudflareSeries,
      cloudflareCurrent, cloudflarePrevious, collectionDays, collectionCounts,
      engagementSeries, engagementCurrent, voters, projectEngagement,
      projectVoters, budgets, freshness,
    ] = await Promise.all([
      env.DB.prepare(`
        SELECT ${siteBucket} AS bucket, SUM(page_views) AS page_views,
               SUM(navigation_count) AS navigation_count, SUM(load_ms_sum) AS load_ms_sum,
               MAX(load_ms_max) AS load_ms_max, SUM(response_4xx) AS response_4xx,
               SUM(response_5xx) AS response_5xx
          FROM analytics_daily_routes WHERE metric_date BETWEEN ? AND ?
         GROUP BY bucket ORDER BY bucket
      `).bind(from, to).all(),
      env.DB.prepare(`
        SELECT route_key, SUM(page_views) AS page_views,
               SUM(navigation_count) AS navigation_count, SUM(load_ms_sum) AS load_ms_sum,
               MAX(load_ms_max) AS load_ms_max
          FROM analytics_daily_routes WHERE metric_date BETWEEN ? AND ?
         GROUP BY route_key ORDER BY page_views DESC LIMIT 50
      `).bind(from, to).all(),
      env.DB.prepare(`
        SELECT SUM(page_views) AS page_views, SUM(navigation_count) AS navigation_count,
               SUM(load_ms_sum) AS load_ms_sum, SUM(response_4xx) AS response_4xx,
               SUM(response_5xx) AS response_5xx
          FROM analytics_daily_routes WHERE metric_date BETWEEN ? AND ?
      `).bind(from, to).first<SiteSummaryRow>(),
      env.DB.prepare(`
        SELECT SUM(page_views) AS page_views, SUM(navigation_count) AS navigation_count,
               SUM(load_ms_sum) AS load_ms_sum, SUM(response_4xx) AS response_4xx,
               SUM(response_5xx) AS response_5xx
          FROM analytics_daily_routes WHERE metric_date BETWEEN ? AND ?
      `).bind(previousFrom, previousTo).first<SiteSummaryRow>(),
      env.DB.prepare(`
        SELECT ${cloudflareBucket} AS bucket,
               SUM(requests_estimate) AS requests_estimate,
               SUM(visits_estimate) AS visits_estimate,
               SUM(response_bytes) AS response_bytes,
               SUM(response_2xx) AS response_2xx, SUM(response_3xx) AS response_3xx,
               SUM(response_4xx) AS response_4xx, SUM(response_5xx) AS response_5xx,
               SUM(cache_hits_estimate) AS cache_hits_estimate,
               SUM(cache_misses_estimate) AS cache_misses_estimate,
               MAX(sample_interval) AS max_sample_interval
          FROM analytics_daily_cloudflare WHERE metric_date BETWEEN ? AND ?
         GROUP BY bucket ORDER BY bucket
      `).bind(from, to).all(),
      env.DB.prepare(`
        SELECT SUM(requests_estimate) AS requests_estimate, SUM(visits_estimate) AS visits_estimate,
               SUM(response_bytes) AS response_bytes, SUM(response_4xx) AS response_4xx,
               SUM(response_5xx) AS response_5xx, SUM(cache_hits_estimate) AS cache_hits_estimate,
               SUM(cache_misses_estimate) AS cache_misses_estimate
          FROM analytics_daily_cloudflare WHERE metric_date BETWEEN ? AND ?
      `).bind(from, to).first(),
      env.DB.prepare(`
        SELECT SUM(requests_estimate) AS requests_estimate, SUM(visits_estimate) AS visits_estimate,
               SUM(response_bytes) AS response_bytes, SUM(response_4xx) AS response_4xx,
               SUM(response_5xx) AS response_5xx, SUM(cache_hits_estimate) AS cache_hits_estimate,
               SUM(cache_misses_estimate) AS cache_misses_estimate
          FROM analytics_daily_cloudflare WHERE metric_date BETWEEN ? AND ?
      `).bind(previousFrom, previousTo).first(),
      env.DB.prepare(`
        SELECT metric_date, status, attempts, started_at, finished_at, error_summary
          FROM analytics_collection_days ORDER BY metric_date DESC LIMIT 100
      `).all(),
      env.DB.prepare(`
        SELECT status, COUNT(*) AS count FROM analytics_collection_days GROUP BY status
      `).all(),
      env.DB.prepare(`
        SELECT ${engagementBucket} AS bucket, SUM(review_opens) AS review_opens,
               SUM(review_closes) AS review_closes, SUM(active_seconds) AS active_seconds,
               SUM(votes_submitted) AS votes_submitted
          FROM analytics_daily_engagement WHERE metric_date BETWEEN ? AND ?
         GROUP BY bucket ORDER BY bucket
      `).bind(from, to).all(),
      env.DB.prepare(`
        SELECT SUM(review_opens) AS review_opens, SUM(review_closes) AS review_closes,
               SUM(active_seconds) AS active_seconds, SUM(votes_submitted) AS votes_submitted
          FROM analytics_daily_engagement WHERE metric_date BETWEEN ? AND ?
      `).bind(from, to).first<EngagementSummaryRow>(),
      env.DB.prepare(`
        SELECT COUNT(DISTINCT github_login) AS count FROM user_votes
         WHERE voted_at >= ? AND voted_at < ?
      `).bind(`${from}T00:00:00.000Z`, `${shiftDate(to, 1)}T00:00:00.000Z`).first<{ count: number }>(),
      env.DB.prepare(`
        SELECT a.repo_id, r.name AS project, SUM(a.review_opens) AS review_opens,
               SUM(a.review_closes) AS review_closes, SUM(a.active_seconds) AS active_seconds,
               SUM(a.votes_submitted) AS votes_submitted
          FROM analytics_daily_engagement a JOIN repos r ON r.id = a.repo_id
         WHERE a.metric_date BETWEEN ? AND ?
         GROUP BY a.repo_id, r.name ORDER BY review_opens DESC
      `).bind(from, to).all<{ repo_id: number; project: string }>(),
      env.DB.prepare(`
        SELECT p.repo_id, COUNT(DISTINCT v.github_login) AS contributors
          FROM user_votes v JOIN pull_requests p ON p.id = v.pr_id
         WHERE v.voted_at >= ? AND v.voted_at < ?
         GROUP BY p.repo_id
      `).bind(`${from}T00:00:00.000Z`, `${shiftDate(to, 1)}T00:00:00.000Z`).all<{ repo_id: number; contributors: number }>(),
      env.DB.prepare(`
        SELECT budget_date, budget_key, label, unit, configured_limit, consumed, deferred
          FROM sync_daily_budgets WHERE budget_date BETWEEN ? AND ?
         ORDER BY budget_date, budget_key
      `).bind(from, to).all(),
      env.DB.prepare(`
        SELECT
          (SELECT MAX(metric_date) FROM analytics_daily_routes) AS first_party_date,
          (SELECT MAX(metric_date) FROM analytics_daily_cloudflare) AS cloudflare_date,
          (SELECT MAX(metric_date) FROM analytics_daily_engagement) AS engagement_date
      `).first(),
    ]);

    const voterCount = voters?.count ?? 0;
    const projectVoterMap = new Map((projectVoters.results ?? []).map(row => [row.repo_id, row.contributors]));
    const safeProjectEngagement = (projectEngagement.results ?? [])
      .filter(row => (projectVoterMap.get(row.repo_id) ?? 0) >= PRIVACY_MIN_CONTRIBUTORS)
      .map(row => ({ ...row, contributors: projectVoterMap.get(row.repo_id) ?? 0 }));
    const privacySuppressed = voterCount < PRIVACY_MIN_CONTRIBUTORS;

    return jsonOk({
      range: { from, to, granularity, days: rangeDays, previous_from: previousFrom, previous_to: previousTo },
      privacy: {
        minimum_contributors: PRIVACY_MIN_CONTRIBUTORS,
        contributing_voters: voterCount,
        engagement_suppressed: privacySuppressed,
        individual_identifiers_stored: false,
        individual_identifiers_returned: false,
      },
      freshness: freshness ?? {},
      configuration: {
        cloudflare_ready: Boolean(env.CLOUDFLARE_ANALYTICS_TOKEN && env.CLOUDFLARE_ZONE_ID),
        first_party_collection: true,
        detailed_retention_days: 400,
      },
      site: {
        current: siteCurrent ?? {}, previous: sitePrevious ?? {},
        series: siteSeries.results ?? [], routes: routeTotals.results ?? [],
      },
      cloudflare: {
        current: cloudflareCurrent ?? {}, previous: cloudflarePrevious ?? {},
        series: cloudflareSeries.results ?? [], source_is_estimated: true,
      },
      engagement: privacySuppressed ? null : {
        current: engagementCurrent ?? {}, series: engagementSeries.results ?? [],
        projects: safeProjectEngagement,
      },
      collection: {
        counts: collectionCounts.results ?? [], days: collectionDays.results ?? [],
      },
      budgets: budgets.results ?? [],
    }, request, { cache: 'no-store' });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/no such table:\s*(?:main\.)?analytics_/i.test(message)) {
      return jsonErr('Analytics schema is not available yet. Apply D1 migration 0010.', 503, request);
    }
    console.error(JSON.stringify({ event: 'admin_analytics_query_failed', error: message.slice(0, 300) }));
    return jsonErr('Failed to load analytics.', 500, request);
  }
}

export async function handleAdminAnalyticsCollect(request: Request, env: Env): Promise<Response> {
  const authorization = await requireAdmin(request, env);
  if (authorization.error) return authorization.error;
  if (!validateCSRF(request)) return jsonErr('Invalid security token', 403, request);
  if (env.ENVIRONMENT !== 'production') return jsonErr('Cloudflare analytics collection is production-only', 409, request);
  await recordPrivilegedAction(env, authorization.principal, {
    action: 'analytics.collect', targetType: 'analytics', targetId: 'cloudflare', outcome: 'accepted',
  });
  const result = await runAnalyticsCollector(env, 'manual');
  return jsonOk({ ...result }, request, { cache: 'no-store' });
}
