import type { Env } from './types.js';
import {
  finishSyncJob,
  recordDailyBudget,
  recordSyncJobEvent,
  safeErrorSummary,
  startSyncJob,
} from './syncJobs.js';

const GRAPHQL_ENDPOINT = 'https://api.cloudflare.com/client/v4/graphql';
const BACKFILL_DAYS = 30;
const COLLECTION_BATCH_DAYS = 5;
const DETAIL_RETENTION_DAYS = 400;
const RECEIPT_RETENTION_DAYS = 2;

export type EngagementEventType = 'review_opened' | 'review_heartbeat' | 'review_closed';

interface CloudflareGroup {
  count?: number;
  avg?: { sampleInterval?: number };
  sum?: { visits?: number; edgeResponseBytes?: number };
  dimensions?: { edgeResponseStatus?: number; cacheStatus?: string };
}

interface CloudflareGraphQLResponse {
  data?: {
    viewer?: {
      zones?: Array<{
        totals?: CloudflareGroup[];
        statuses?: CloudflareGroup[];
        cache?: CloudflareGroup[];
      }>;
    };
  };
  errors?: Array<{ message?: string }>;
}

export interface AnalyticsCollectorResult {
  started: boolean;
  job_run_id: string;
  processed_days: number;
  failed_days: number;
  remaining_days: number;
  configuration_required: boolean;
}

function isoNow(): string {
  return new Date().toISOString();
}

function utcDateDaysAgo(days: number, reference = new Date()): string {
  return new Date(Date.UTC(
    reference.getUTCFullYear(),
    reference.getUTCMonth(),
    reference.getUTCDate() - days,
  )).toISOString().slice(0, 10);
}

function endOfUtcDate(date: string): string {
  const start = new Date(`${date}T00:00:00.000Z`);
  start.setUTCDate(start.getUTCDate() + 1);
  return start.toISOString();
}

function finiteNonNegative(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.round(value)
    : 0;
}

function statusClass(status: number): '2xx' | '3xx' | '4xx' | '5xx' | null {
  if (status >= 200 && status < 300) return '2xx';
  if (status >= 300 && status < 400) return '3xx';
  if (status >= 400 && status < 500) return '4xx';
  if (status >= 500 && status < 600) return '5xx';
  return null;
}

export function normalizeAnalyticsRoute(pathname: string): string {
  const path = pathname.split('?')[0].replace(/\/+$/, '') || '/';
  if (/^\/workspace\/status\/runs\/[^/]+$/.test(path)) return '/workspace/status/runs/:id';
  if (/^\/api\/pr-panel\/\d+\/(details|files|comments|react)$/.test(path)) {
    return path.replace(/\/\d+\//, '/:id/');
  }
  if (/^\/api\/contributors\/[^/]+$/.test(path)) return '/api/contributors/:login';
  if (/^\/api\/admin\/users\/\d+\/role$/.test(path)) return '/api/admin/users/:id/role';
  const approved = new Set([
    '/', '/about', '/overview', '/support', '/sponsors', '/brand', '/news', '/news/launch',
    '/calculator', '/workspace', '/workspace/projects', '/workspace/pull-requests',
    '/workspace/contributors', '/workspace/maintainers', '/workspace/tools', '/workspace/status',
    '/admin', '/admin/analytics',
  ]);
  if (approved.has(path)) return path;
  if (path.startsWith('/api/')) return '/api/other';
  return '/other';
}

async function acceptEventReceipt(
  db: D1Database,
  eventId: string,
  now: Date,
): Promise<boolean> {
  const expires = new Date(now.getTime() + RECEIPT_RETENTION_DAYS * 86_400_000).toISOString();
  const result = await db.prepare(`
    INSERT OR IGNORE INTO analytics_event_receipts (event_id, event_date, expires_at)
    VALUES (?, ?, ?)
  `).bind(eventId, now.toISOString().slice(0, 10), expires).run();
  return (result.meta.changes ?? 0) === 1;
}

export async function recordPageView(
  db: D1Database,
  input: { eventId: string; path: string; loadMs: number | null; responseStatus: number | null },
): Promise<{ recorded: boolean; route: string }> {
  const now = new Date();
  const route = normalizeAnalyticsRoute(input.path);
  if (!await acceptEventReceipt(db, input.eventId, now)) return { recorded: false, route };
  const loadMs = input.loadMs === null ? 0 : Math.min(120_000, Math.max(0, Math.round(input.loadMs)));
  const hasNavigation = input.loadMs !== null ? 1 : 0;
  const responseClass = input.responseStatus === null ? null : statusClass(input.responseStatus);
  await db.prepare(`
    INSERT INTO analytics_daily_routes (
      metric_date, route_key, page_views, navigation_count, load_ms_sum, load_ms_max,
      response_2xx, response_3xx, response_4xx, response_5xx, updated_at
    ) VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(metric_date, route_key) DO UPDATE SET
      page_views = analytics_daily_routes.page_views + 1,
      navigation_count = analytics_daily_routes.navigation_count + excluded.navigation_count,
      load_ms_sum = analytics_daily_routes.load_ms_sum + excluded.load_ms_sum,
      load_ms_max = MAX(analytics_daily_routes.load_ms_max, excluded.load_ms_max),
      response_2xx = analytics_daily_routes.response_2xx + excluded.response_2xx,
      response_3xx = analytics_daily_routes.response_3xx + excluded.response_3xx,
      response_4xx = analytics_daily_routes.response_4xx + excluded.response_4xx,
      response_5xx = analytics_daily_routes.response_5xx + excluded.response_5xx,
      updated_at = excluded.updated_at
  `).bind(
    now.toISOString().slice(0, 10),
    route,
    hasNavigation,
    loadMs,
    loadMs,
    responseClass === '2xx' ? 1 : 0,
    responseClass === '3xx' ? 1 : 0,
    responseClass === '4xx' ? 1 : 0,
    responseClass === '5xx' ? 1 : 0,
    now.toISOString(),
  ).run();
  return { recorded: true, route };
}

export async function recordEngagementEvent(
  db: D1Database,
  input: { eventId: string; prId: number; type: EngagementEventType; activeSeconds: number },
): Promise<{ recorded: boolean; repoId: number | null }> {
  const pr = await db.prepare(`
    SELECT p.repo_id FROM pull_requests p
    JOIN repos r ON r.id = p.repo_id
    WHERE p.id = ? AND p.deleted = 0 AND r.active = 1
  `).bind(input.prId).first<{ repo_id: number | null }>();
  if (!pr?.repo_id) return { recorded: false, repoId: null };
  const now = new Date();
  if (!await acceptEventReceipt(db, input.eventId, now)) return { recorded: false, repoId: pr.repo_id };
  const opens = input.type === 'review_opened' ? 1 : 0;
  const closes = input.type === 'review_closed' ? 1 : 0;
  const activeSeconds = input.type === 'review_heartbeat'
    ? Math.min(60, Math.max(1, Math.round(input.activeSeconds)))
    : 0;
  await upsertEngagement(db, now.toISOString().slice(0, 10), pr.repo_id, {
    opens, closes, activeSeconds, votes: 0,
  });
  return { recorded: true, repoId: pr.repo_id };
}

async function upsertEngagement(
  db: D1Database,
  date: string,
  repoId: number,
  values: { opens: number; closes: number; activeSeconds: number; votes: number },
): Promise<void> {
  await db.prepare(`
    INSERT INTO analytics_daily_engagement (
      metric_date, repo_id, review_opens, review_closes, active_seconds,
      votes_submitted, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(metric_date, repo_id) DO UPDATE SET
      review_opens = analytics_daily_engagement.review_opens + excluded.review_opens,
      review_closes = analytics_daily_engagement.review_closes + excluded.review_closes,
      active_seconds = analytics_daily_engagement.active_seconds + excluded.active_seconds,
      votes_submitted = analytics_daily_engagement.votes_submitted + excluded.votes_submitted,
      updated_at = excluded.updated_at
  `).bind(
    date, repoId, values.opens, values.closes, values.activeSeconds, values.votes, isoNow(),
  ).run();
}

export async function recordSubmittedVote(
  db: D1Database,
  repoId: number | null,
  votedAt: string,
): Promise<void> {
  if (!repoId) return;
  await upsertEngagement(db, votedAt.slice(0, 10), repoId, {
    opens: 0, closes: 0, activeSeconds: 0, votes: 1,
  });
}

async function seedCollectionDays(db: D1Database, reference = new Date()): Promise<void> {
  const now = reference.toISOString();
  const statements: D1PreparedStatement[] = [];
  for (let daysAgo = BACKFILL_DAYS; daysAgo >= 1; daysAgo--) {
    statements.push(db.prepare(`
      INSERT OR IGNORE INTO analytics_collection_days (metric_date, status, updated_at)
      VALUES (?, 'pending', ?)
    `).bind(utcDateDaysAgo(daysAgo, reference), now));
  }
  if (statements.length > 0) await db.batch(statements);
}

async function collectCloudflareDay(env: Env, date: string): Promise<{
  requests: number;
  visits: number;
  bytes: number;
  response2xx: number;
  response3xx: number;
  response4xx: number;
  response5xx: number;
  cacheHits: number;
  cacheMisses: number;
  sampleInterval: number | null;
}> {
  const query = `
    query OASISDailyAnalytics($zoneTag: string, $start: Time, $end: Time) {
      viewer {
        zones(filter: { zoneTag: $zoneTag }) {
          totals: httpRequestsAdaptiveGroups(
            limit: 1
            filter: { datetime_geq: $start, datetime_lt: $end, requestSource: "eyeball" }
          ) { count avg { sampleInterval } sum { visits edgeResponseBytes } }
          statuses: httpRequestsAdaptiveGroups(
            limit: 100
            orderBy: [count_DESC]
            filter: { datetime_geq: $start, datetime_lt: $end, requestSource: "eyeball" }
          ) { count dimensions { edgeResponseStatus } }
          cache: httpRequestsAdaptiveGroups(
            limit: 100
            orderBy: [count_DESC]
            filter: { datetime_geq: $start, datetime_lt: $end, requestSource: "eyeball" }
          ) { count dimensions { cacheStatus } }
        }
      }
    }
  `;
  const response = await fetch(GRAPHQL_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.CLOUDFLARE_ANALYTICS_TOKEN}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Rate-Limit-Type': 'account-based',
    },
    body: JSON.stringify({
      query,
      variables: {
        zoneTag: env.CLOUDFLARE_ZONE_ID,
        start: `${date}T00:00:00.000Z`,
        end: endOfUtcDate(date),
      },
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Cloudflare Analytics API returned HTTP ${response.status}`);
  const payload = await response.json() as CloudflareGraphQLResponse;
  if (payload.errors?.length) {
    throw new Error(`Cloudflare Analytics query failed: ${payload.errors.map(error => error.message ?? 'unknown error').join('; ')}`);
  }
  const zone = payload.data?.viewer?.zones?.[0];
  if (!zone) throw new Error('Cloudflare Analytics query returned no matching zone');
  const total = zone.totals?.[0];
  const statuses = { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0 };
  for (const group of zone.statuses ?? []) {
    const key = statusClass(finiteNonNegative(group.dimensions?.edgeResponseStatus));
    if (key) statuses[key] += finiteNonNegative(group.count);
  }
  let cacheHits = 0;
  let cacheMisses = 0;
  for (const group of zone.cache ?? []) {
    const cacheStatus = group.dimensions?.cacheStatus?.toLowerCase() ?? '';
    const count = finiteNonNegative(group.count);
    if (cacheStatus === 'hit' || cacheStatus === 'revalidated' || cacheStatus === 'updating') cacheHits += count;
    else cacheMisses += count;
  }
  return {
    requests: finiteNonNegative(total?.count),
    visits: finiteNonNegative(total?.sum?.visits),
    bytes: finiteNonNegative(total?.sum?.edgeResponseBytes),
    response2xx: statuses['2xx'],
    response3xx: statuses['3xx'],
    response4xx: statuses['4xx'],
    response5xx: statuses['5xx'],
    cacheHits,
    cacheMisses,
    sampleInterval: typeof total?.avg?.sampleInterval === 'number'
      && Number.isFinite(total.avg.sampleInterval)
      ? total.avg.sampleInterval
      : null,
  };
}

async function pruneAnalytics(db: D1Database): Promise<void> {
  const detailCutoff = utcDateDaysAgo(DETAIL_RETENTION_DAYS);
  const now = isoNow();
  await db.batch([
    db.prepare('DELETE FROM analytics_daily_routes WHERE metric_date < ?').bind(detailCutoff),
    db.prepare('DELETE FROM analytics_daily_cloudflare WHERE metric_date < ?').bind(detailCutoff),
    db.prepare('DELETE FROM analytics_daily_engagement WHERE metric_date < ?').bind(detailCutoff),
    db.prepare('DELETE FROM analytics_collection_days WHERE metric_date < ?').bind(detailCutoff),
    db.prepare('DELETE FROM analytics_event_receipts WHERE expires_at < ?').bind(now),
  ]);
}

async function executeAnalyticsCollector(
  env: Env,
  runId: string,
): Promise<AnalyticsCollectorResult> {
  // Retention is enforced even when the external archive is not configured or
  // temporarily failing, so first-party aggregates cannot grow indefinitely.
  await pruneAnalytics(env.DB);
  if (!env.CLOUDFLARE_ANALYTICS_TOKEN || !env.CLOUDFLARE_ZONE_ID) {
    const message = 'CLOUDFLARE_ANALYTICS_TOKEN and CLOUDFLARE_ZONE_ID must be configured.';
    await finishSyncJob(env.DB, runId, 'deferred', {
      errorCode: 'analytics_configuration_required', error: message,
    });
    return {
      started: false,
      job_run_id: runId,
      processed_days: 0,
      failed_days: 0,
      remaining_days: 0,
      configuration_required: true,
    };
  }

  await seedCollectionDays(env.DB);
  const staleBefore = new Date(Date.now() - 30 * 60_000).toISOString();
  await env.DB.prepare(`
    UPDATE analytics_collection_days
       SET status = 'failed', finished_at = ?,
           error_summary = 'Collection lease expired before completion', updated_at = ?
     WHERE status = 'running' AND updated_at < ?
  `).bind(isoNow(), isoNow(), staleBefore).run();
  const pending = await env.DB.prepare(`
    SELECT metric_date FROM analytics_collection_days
     WHERE status IN ('pending', 'failed') AND attempts < 5
     ORDER BY metric_date ASC LIMIT ?
  `).bind(COLLECTION_BATCH_DAYS).all<{ metric_date: string }>();
  let processed = 0;
  let failed = 0;
  let d1Writes = 0;
  let graphqlQueries = 0;
  for (const row of pending.results ?? []) {
    const startedAt = isoNow();
    const claim = await env.DB.prepare(`
      UPDATE analytics_collection_days
         SET status = 'running', attempts = attempts + 1, started_at = ?,
             finished_at = NULL, error_summary = NULL, updated_at = ?
       WHERE metric_date = ? AND status IN ('pending', 'failed') AND attempts < 5
    `).bind(startedAt, startedAt, row.metric_date).run();
    if ((claim.meta.changes ?? 0) !== 1) continue;
    d1Writes++;
    graphqlQueries++;
    try {
      const metrics = await collectCloudflareDay(env, row.metric_date);
      const completedAt = isoNow();
      await env.DB.batch([
        env.DB.prepare(`
          INSERT INTO analytics_daily_cloudflare (
            metric_date, requests_estimate, visits_estimate, response_bytes,
            response_2xx, response_3xx, response_4xx, response_5xx,
            cache_hits_estimate, cache_misses_estimate, sample_interval,
            source_is_estimated, collected_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
          ON CONFLICT(metric_date) DO UPDATE SET
            requests_estimate = excluded.requests_estimate,
            visits_estimate = excluded.visits_estimate,
            response_bytes = excluded.response_bytes,
            response_2xx = excluded.response_2xx,
            response_3xx = excluded.response_3xx,
            response_4xx = excluded.response_4xx,
            response_5xx = excluded.response_5xx,
            cache_hits_estimate = excluded.cache_hits_estimate,
            cache_misses_estimate = excluded.cache_misses_estimate,
            sample_interval = excluded.sample_interval,
            source_is_estimated = excluded.source_is_estimated,
            collected_at = excluded.collected_at
        `).bind(
          row.metric_date, metrics.requests, metrics.visits, metrics.bytes,
          metrics.response2xx, metrics.response3xx, metrics.response4xx, metrics.response5xx,
          metrics.cacheHits, metrics.cacheMisses, metrics.sampleInterval, completedAt,
        ),
        env.DB.prepare(`
          UPDATE analytics_collection_days
             SET status = 'succeeded', finished_at = ?, error_summary = NULL, updated_at = ?
           WHERE metric_date = ?
        `).bind(completedAt, completedAt, row.metric_date),
      ]);
      d1Writes += 2;
      processed++;
    } catch (error) {
      const completedAt = isoNow();
      await env.DB.prepare(`
        UPDATE analytics_collection_days
           SET status = 'failed', finished_at = ?, error_summary = ?, updated_at = ?
         WHERE metric_date = ?
      `).bind(completedAt, safeErrorSummary(error), completedAt, row.metric_date).run();
      await recordSyncJobEvent(env.DB, runId, {
        type: 'analytics_day_failed', entityType: 'date', entityId: row.metric_date,
        message: safeErrorSummary(error), responseStatus: null,
      });
      d1Writes += 2;
      failed++;
    }
  }
  const remaining = await env.DB.prepare(`
    SELECT COUNT(*) AS count FROM analytics_collection_days
     WHERE status IN ('pending', 'failed') AND attempts < 5
  `).first<{ count: number }>();
  await Promise.all([
    recordDailyBudget(env.DB, {
      key: 'cloudflare_graphql_queries', label: 'Cloudflare Analytics GraphQL queries',
      unit: 'queries', limit: 300, consumedDelta: graphqlQueries,
    }),
    recordDailyBudget(env.DB, {
      key: 'analytics_d1_writes', label: 'Analytics D1 writes', unit: 'writes',
      consumedDelta: d1Writes + 5,
    }),
  ]);
  const metrics = {
    processed_days: processed,
    failed_days: failed,
    remaining_days: remaining?.count ?? 0,
    graphql_queries: graphqlQueries,
  };
  await finishSyncJob(env.DB, runId, failed > 0 ? 'failed' : 'succeeded', {
    metrics,
    completedItems: processed,
    failedItems: failed,
    errorCode: failed > 0 ? 'analytics_days_failed' : null,
    error: failed > 0 ? `${failed} analytics day(s) failed to collect` : undefined,
  });
  return {
    started: true,
    job_run_id: runId,
    processed_days: processed,
    failed_days: failed,
    remaining_days: remaining?.count ?? 0,
    configuration_required: false,
  };
}

export async function runAnalyticsCollector(
  env: Env,
  trigger: 'scheduled' | 'manual',
): Promise<AnalyticsCollectorResult> {
  const runId = await startSyncJob(env.DB, {
    jobKey: 'cloudflare_analytics', trigger, mode: 'live', status: 'running',
  });
  try {
    return await executeAnalyticsCollector(env, runId);
  } catch (error) {
    try {
      await finishSyncJob(env.DB, runId, 'failed', {
        errorCode: 'analytics_collector_failed', error: safeErrorSummary(error),
      });
    } catch (finishError) {
      console.error(JSON.stringify({
        event: 'analytics_collector_finish_failed',
        error: safeErrorSummary(finishError),
      }));
    }
    throw error;
  }
}
