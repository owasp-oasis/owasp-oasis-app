/**
 * OWASP OASIS — Cloudflare Worker entry point.
 * React SPA served via ASSETS binding; API routes handled by worker.
 */

import type { Env } from './types.js';
import {
  ALLOWED_METHODS,
  ALLOWED_ORIGINS,
  CSRF_COOKIE,
  secHeaders,
  handleOptions,
  generateCSRF,
  isLoopbackRequest,
  isAdminRequest,
  jsonOk,
  jsonErr,
} from './security.js';
import { reconcileRemovedRepositories } from './cleanup.js';
import { HUBSPOT_SYNC_CRON } from './hubspot.js';
import { runTrackedHubSpot } from './scheduledJobs.js';
import { startShadowSync } from './shadowSync.js';
import {
  CanonicalSyncWorkflow,
  canonicalCutoverEligible,
  canonicalScheduleEnabled,
  setCanonicalScheduleEnabled,
  startBoundedLegacySync,
  startCanonicalSync,
} from './canonicalSync.js';
import { OrphanCleanupWorkflow } from './orphanCleanupWorkflow.js';
import { HubSpotSyncWorkflow } from './hubSpotSyncWorkflow.js';
import { ManualSyncJobWorkflow } from './manualSyncJobWorkflow.js';
import {
  handleMeta,
  handleRepos,
  handleRepoDetail,
  handlePRs,
  handleContributors,
  handleContributorDetail,
  handleMaintainers,
  handleTools,
} from './handlers/leaderboard.js';
import { handleRegister } from './handlers/register.js';
import { handleApply } from './handlers/apply.js';
import { handleFeedback } from './handlers/feedback.js';
import { handleLogin, handleCallback, handleMe, handleLogout } from './handlers/auth.js';
import { handleGetPreferences, handlePutPreferences } from './handlers/preferences.js';
import { handleVote, handleMyVotes } from './handlers/vote.js';
import { handlePRDetails, handlePRFiles, handlePRComments, handlePRReact } from './handlers/prPanel.js';
import { handleSyncRunDetail, handleSyncStatus } from './handlers/syncStatus.js';
import { handleRetrySyncJob } from './handlers/syncRetry.js';
import { handleCancelSyncRun } from './handlers/syncCancel.js';
import { handleAdminUserRole, handleAdminUsers } from './handlers/adminUsers.js';
import {
  handleAdminAnalytics,
  handleAdminAnalyticsBackfill,
  handleAdminAnalyticsCollect,
  handleAnalyticsEngagement,
  handleAnalyticsPageView,
} from './handlers/analytics.js';
import { runAnalyticsCollector } from './analytics.js';

const ANALYTICS_CRON = '45 3 * * *';

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url    = new URL(request.url);
    const method = request.method;

    if (!ALLOWED_METHODS.has(method)) {
      return secHeaders(new Response('Method Not Allowed', {
        status: 405,
        headers: { Allow: 'GET, POST, OPTIONS, HEAD' },
      }));
    }

    if (method === 'OPTIONS') return handleOptions(request);

    const isLocal = (
      url.hostname === '127.0.0.1' ||
      url.hostname === 'localhost'  ||
      url.hostname === '0.0.0.0'   ||
      env.ENVIRONMENT !== 'production'
    );

    if (url.protocol === 'http:' && !isLocal) {
      return Response.redirect(`https://${url.host}${url.pathname}${url.search}`, 301);
    }

    // Canonical domain redirects (production only)
    if (!isLocal && url.hostname === 'owasp-oasis.com') {
      return Response.redirect(`https://www.owasp-oasis.com${url.pathname}${url.search}`, 301);
    }
    if (!isLocal && url.hostname === 'owasp-oasis.org') {
      return Response.redirect(`https://www.owasp-oasis.org${url.pathname}${url.search}`, 301);
    }

    try {
      /* ── GET /api/csrf ─────────────────────────────────────────── */
      if (method === 'GET' && url.pathname === '/api/csrf') {
        const csrf = generateCSRF();
        const res = Response.json({ token: csrf }, { status: 200 });
        const r   = secHeaders(res, request);
        const secure = isLoopbackRequest(request) ? '' : 'Secure; ';
        r.headers.set('Set-Cookie',
          `${CSRF_COOKIE}=${csrf}; Path=/; SameSite=Strict; ${secure}HttpOnly; Max-Age=3600`);
        r.headers.set('Cache-Control', 'no-store');
        return r;
      }

      /* ── GET /api/count ────────────────────────────────────────── */
      if (method === 'GET' && url.pathname === '/api/count') {
        try {
          const row = env.DB
            ? await env.DB.prepare('SELECT COUNT(*) as count FROM registrations').first<{ count: number }>()
            : { count: 0 };
          return jsonOk({ count: row?.count ?? 0 }, request);
        } catch { return jsonOk({ count: 0 }, request); }
      }

      /* ── POST /api/register ────────────────────────────────────── */
      if (method === 'POST' && url.pathname === '/api/register') {
        return await handleRegister(request, env, ctx);
      }

      /* ── POST /api/apply ───────────────────────────────────────── */
      if (method === 'POST' && url.pathname === '/api/apply') {
        return await handleApply(request, env, ctx);
      }

      /* ── POST /api/feedback ────────────────────────────────────── */
      if (method === 'POST' && url.pathname === '/api/feedback') {
        return await handleFeedback(request, env);
      }

       /* ── Auth (GitHub OAuth) ────────────────────────────────────── */
       if (method === 'GET'  && url.pathname === '/api/auth/login')    return await handleLogin(request, env);
       if (method === 'GET'  && url.pathname === '/api/auth/callback') return await handleCallback(request, env);
       if (method === 'GET'  && url.pathname === '/api/auth/me')       return await handleMe(request, env);
       if (method === 'POST' && url.pathname === '/api/auth/logout')   return await handleLogout(request, env);

       /* ── User Preferences ───────────────────────────────────────── */
       if (method === 'GET'  && url.pathname === '/api/preferences/mine') return await handleGetPreferences(request, env);
       if (method === 'PUT'  && url.pathname === '/api/preferences/mine') return await handlePutPreferences(request, env);

       /* ── Voting ─────────────────────────────────────────────────── */
       if (method === 'POST' && url.pathname === '/api/vote')          return await handleVote(request, env);
       if (method === 'GET'  && url.pathname === '/api/votes/mine')    return await handleMyVotes(request, env);

      /* ── PR Panel (proxy to GitHub API) ─────────────────────────── */
      const prPanelMatch = url.pathname.match(/^\/api\/pr-panel\/(\d+)\/(details|files|comments|react)$/);
      if (prPanelMatch) {
        const prId   = parseInt(prPanelMatch[1], 10);
        const action = prPanelMatch[2];
        if (method === 'GET'  && action === 'details')  return await handlePRDetails(request, env, prId);
        if (method === 'GET'  && action === 'files')    return await handlePRFiles(request, env, prId);
        if (method === 'GET'  && action === 'comments') return await handlePRComments(request, env, prId);
        if (method === 'POST' && action === 'react')    return await handlePRReact(request, env, prId);
        return jsonErr('Method not allowed for this PR panel action', 405, request);
      }

      /* ── Public, sanitized synchronization status ───────────────── */
      if (method === 'GET' && url.pathname === '/api/sync/status') {
        return await handleSyncStatus(request, env);
      }
      const syncRunMatch = url.pathname.match(/^\/api\/sync\/status\/runs\/([^/]+)$/);
      if (method === 'GET' && syncRunMatch) {
        return await handleSyncRunDetail(request, env, syncRunMatch[1]);
      }
      const syncRetryMatch = url.pathname.match(/^\/api\/admin\/sync\/jobs\/([a-z0-9_]+)\/retry$/);
      if (method === 'POST' && syncRetryMatch) {
        return await handleRetrySyncJob(request, env, ctx, syncRetryMatch[1]);
      }
      const syncCancelMatch = url.pathname.match(/^\/api\/admin\/sync\/runs\/([^/]+)\/cancel$/);
      if (method === 'POST' && syncCancelMatch) {
        return await handleCancelSyncRun(request, env, syncCancelMatch[1]);
      }

      /* ── Session-authorized user access administration ─────────── */
      if (method === 'GET' && url.pathname === '/api/admin/users') {
        return await handleAdminUsers(request, env);
      }
      const adminUserRoleMatch = url.pathname.match(/^\/api\/admin\/users\/(\d+)\/role$/);
      if (method === 'POST' && adminUserRoleMatch) {
        return await handleAdminUserRole(request, env, Number.parseInt(adminUserRoleMatch[1], 10));
      }

      /* ── Privacy-safe analytics ────────────────────────────────── */
      if (method === 'POST' && url.pathname === '/api/analytics/pageview') {
        return await handleAnalyticsPageView(request, env);
      }
      if (method === 'POST' && url.pathname === '/api/analytics/engagement') {
        return await handleAnalyticsEngagement(request, env);
      }
      if (method === 'GET' && url.pathname === '/api/admin/analytics') {
        return await handleAdminAnalytics(request, env);
      }
      if (method === 'POST' && url.pathname === '/api/admin/analytics/collect') {
        return await handleAdminAnalyticsCollect(request, env);
      }
      if (method === 'POST' && url.pathname === '/api/admin/analytics/backfill') {
        return await handleAdminAnalyticsBackfill(request, env);
      }

      /* ── GET /api/admin/registrations ──────────────────────────── */
      if (method === 'GET' && url.pathname === '/api/admin/registrations') {
        if (!isAdminRequest(request, env)) return jsonErr('Unauthorised', 401, request);
        try {
          const rows = await env.DB.prepare(
            'SELECT id, name, email, github, role, created_at FROM registrations ORDER BY created_at DESC',
          ).all();
          return jsonOk({ registrations: rows.results ?? [] }, request);
        } catch (err) {
          console.error('DB error (admin):', (err as Error)?.message);
          return jsonErr('Failed to fetch registrations', 500, request);
        }
      }

       /* ── Retired monolithic sync endpoint ─────────────────────── */
       if (method === 'GET' && url.pathname === '/api/admin/full-sync') {
         if (!isAdminRequest(request, env)) return jsonErr('Unauthorised', 401, request);
         return jsonErr('The monolithic sync is retired. Use POST /api/admin/sync/canonical/run.', 410, request);
       }

       /* ── GET /api/admin/run-cleanup ───────────────────────────────
        * Reconciles repositories from a complete public organization listing.
        * Pull requests are reconciled from each repository's complete catalog
        * by the bounded canonical Workflow.
        *
        * Protected by X-Admin-Secret header (same as other admin endpoints).
        * ──────────────────────────────────────────────────────────── */
       if (method === 'GET' && url.pathname === '/api/admin/run-cleanup') {
         if (!isAdminRequest(request, env)) return jsonErr('Unauthorised', 401, request);
         if (env.ENVIRONMENT !== 'production') return jsonErr('Canonical cleanup is production-only.', 409, request);
         if (!env.DB) return jsonErr('DB not available', 503, request);
         const repositories = await reconcileRemovedRepositories(env);
         return secHeaders(Response.json({ repositories, pull_requests: { deferred_to_canonical_sync: true } }), request);
       }

       /* ── Bounded canonical sync canary and schedule controls ──── */
       if (method === 'POST' && url.pathname === '/api/admin/sync/canonical/run') {
         if (!isAdminRequest(request, env)) return jsonErr('Unauthorised', 401, request);
         const result = await startCanonicalSync(env, 'manual');
         return secHeaders(Response.json(result, { status: result.started ? 202 : 409 }), request);
       }

       if (method === 'POST' && url.pathname === '/api/admin/sync/canonical/schedule') {
         if (!isAdminRequest(request, env)) return jsonErr('Unauthorised', 401, request);
         if (env.ENVIRONMENT !== 'production') return jsonErr('Canonical scheduling is production-only.', 409, request);
         let body: { enabled?: unknown };
         try {
           body = await request.json<{ enabled?: unknown }>();
         } catch {
           return jsonErr('Request body must be valid JSON.', 400, request);
         }
         if (typeof body.enabled !== 'boolean') return jsonErr('enabled must be a boolean', 400, request);
         if (body.enabled && !await canonicalCutoverEligible(env.DB)) {
           return jsonErr('Canonical scheduling requires three consecutive matching shadow parity runs.', 409, request);
         }
         await setCanonicalScheduleEnabled(env.DB, body.enabled);
         return jsonOk({ enabled: body.enabled }, request);
       }

       /* ── Leaderboard API ───────────────────────────────────────── */
       /* POST /api/admin/run-hubspot-sync — bounded operational fallback */
       if (method === 'POST' && url.pathname === '/api/admin/run-hubspot-sync') {
         if (!isAdminRequest(request, env)) return jsonErr('Unauthorised', 401, request);
         try {
           const result = await runTrackedHubSpot(env, 'manual');
           return secHeaders(Response.json(result, { status: result.started ? 202 : 409 }), request);
         } catch {
           console.error(JSON.stringify({
             event: 'hubspot_sync_manual_failed',
             reason: 'processor_error',
           }));
           return jsonErr('HubSpot sync failed', 500, request);
         }
       }

       if (method === 'GET' && url.pathname === '/api/leaderboard/meta')
         return await handleMeta(env, request);
       if (method === 'GET' && url.pathname === '/api/leaderboard/repos')
         return await handleRepos(env, request, url);

       /* ── Repo detail (for ProjectPanel slide-out) ────────────────── */
       const repoDetailMatch = url.pathname.match(/^\/api\/leaderboard\/repos\/(\d+)$/);
       if (method === 'GET' && repoDetailMatch) {
         return await handleRepoDetail(env, request, Number(repoDetailMatch[1]));
       }

       if (method === 'GET' && url.pathname === '/api/leaderboard/prs')
         return await handlePRs(env, request, url);
       if (method === 'GET' && url.pathname === '/api/leaderboard/contributors')
         return await handleContributors(env, request, url);

       /* ── Contributor detail (for ContributorPanel slide-out) ───── */
       const contributorDetailMatch = url.pathname.match(/^\/api\/contributors\/([^/]+)$/);
       if (method === 'GET' && contributorDetailMatch) {
         const login = decodeURIComponent(contributorDetailMatch[1]);
         return await handleContributorDetail(env, request, login);
       }

      if (method === 'GET' && url.pathname === '/api/leaderboard/maintainers')
        return await handleMaintainers(env, request, url);
      if (method === 'GET' && url.pathname === '/api/leaderboard/tools')
        return await handleTools(env, request, url);

      /* ── Retired public sync trigger ───────────────────────────── */
      if (method === 'GET' && url.pathname === '/leaderboard-refresh') {
        return jsonErr('This public sync trigger is retired. Use the authenticated canonical sync endpoint.', 410, request);
      }

      /* ── React SPA fallback via ASSETS ─────────────────────────── */
      if (env.ASSETS) {
        return env.ASSETS.fetch(request);
      }

      return secHeaders(new Response('Not found', { status: 404 }), request);

    } catch (err) {
      console.error('Unhandled Worker error:', (err as Error)?.message);
      return jsonErr('An unexpected error occurred. Please try again.', 500);
    }
  },

  /* ── Scheduled jobs ─────────────────────────────────────────── */
  async scheduled(event: ScheduledEvent, env: Env, _ctx: ExecutionContext): Promise<void> {
    if (event.cron === ANALYTICS_CRON && env.ENVIRONMENT === 'production') {
      const result = await runAnalyticsCollector(env, 'scheduled');
      console.log(JSON.stringify({ event: 'cloudflare_analytics_collection_complete', ...result }));
      return;
    }
    if (event.cron === HUBSPOT_SYNC_CRON) {
      const dispatch = await runTrackedHubSpot(env, 'scheduled');
      console.log(JSON.stringify({ event: 'hubspot_sync_dispatched', ...dispatch }));
      return;
    }
    if (event.cron === '30 2 * * *' && env.ENVIRONMENT === 'preview') {
      const cutoff = await env.DB.prepare(
        "SELECT value FROM sync_state WHERE key = 'last_synced_at'",
      ).first<{ value: string }>();
      const reference = `preview-${new Date(event.scheduledTime).toISOString()}`;
      await startShadowSync(env, reference, cutoff?.value ?? new Date(event.scheduledTime).toISOString());
      return;
    }
    if (event.cron !== '0 */4 * * *' || env.ENVIRONMENT !== 'production') {
      console.warn(JSON.stringify({ event: 'unknown_cron_trigger', cron: event.cron }));
      return;
    }
    if (!await canonicalScheduleEnabled(env.DB)) {
      const dispatch = await startBoundedLegacySync(env);
      console.log(JSON.stringify({ event: 'bounded_legacy_sync_dispatched', ...dispatch }));
      return;
    }
    const dispatch = await startCanonicalSync(env, 'scheduled');
    console.log(JSON.stringify({ event: 'canonical_sync_dispatched', ...dispatch }));
  },
};

// Re-export ALLOWED_ORIGINS for use in any future edge middleware
export { ALLOWED_ORIGINS };
export { ShadowSyncWorkflow } from './shadowSync.js';
export { CanonicalSyncWorkflow };
export { OrphanCleanupWorkflow };
export { HubSpotSyncWorkflow };
export { ManualSyncJobWorkflow };
