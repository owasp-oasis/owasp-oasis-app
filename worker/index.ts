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
  jsonOk,
  jsonErr,
} from './security.js';
import { runSync, runSyncOneRepo } from './sync.js';
import {
  handleMeta,
  handleRepos,
  handlePRs,
  handleContributors,
  handleMaintainers,
  handleTools,
} from './handlers/leaderboard.js';
import { handleRegister } from './handlers/register.js';
import { handleFeedback } from './handlers/feedback.js';
import { handleLogin, handleCallback, handleMe, handleLogout } from './handlers/auth.js';
import { handleVote, handleMyVotes } from './handlers/vote.js';
import { handlePRDetails, handlePRFiles, handlePRComments, handlePRReact } from './handlers/prPanel.js';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
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
        r.headers.set('Set-Cookie',
          `${CSRF_COOKIE}=${csrf}; Path=/; SameSite=Strict; Secure; HttpOnly; Max-Age=3600`);
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
        return await handleRegister(request, env);
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

      /* ── GET /api/admin/registrations ──────────────────────────── */
      if (method === 'GET' && url.pathname === '/api/admin/registrations') {
        const secret    = request.headers.get('X-Admin-Secret');
        const envSecret = env.ADMIN_SECRET ?? '';
        if (!secret || !envSecret || secret !== envSecret) return jsonErr('Unauthorised', 401, request);
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

      /* ── Leaderboard API ───────────────────────────────────────── */
      if (method === 'GET' && url.pathname === '/api/leaderboard/meta')
        return await handleMeta(env, request);
      if (method === 'GET' && url.pathname === '/api/leaderboard/repos')
        return await handleRepos(env, request, url);
      if (method === 'GET' && url.pathname === '/api/leaderboard/prs')
        return await handlePRs(env, request, url);
      if (method === 'GET' && url.pathname === '/api/leaderboard/contributors')
        return await handleContributors(env, request, url);
      if (method === 'GET' && url.pathname === '/api/leaderboard/maintainers')
        return await handleMaintainers(env, request, url);
      if (method === 'GET' && url.pathname === '/api/leaderboard/tools')
        return await handleTools(env, request, url);

      /* ── Manual sync trigger — chunked one repo per call ───────── */
      if (method === 'GET' && url.pathname === '/leaderboard-refresh') {
        if (!env.DB) return jsonErr('DB not available', 503, request);
        await env.DB.prepare(
          "INSERT OR REPLACE INTO sync_state (key, value) VALUES ('sync_running', '1')",
        ).run();
        await env.DB.prepare(
          "INSERT OR REPLACE INTO sync_state (key, value) VALUES ('last_manual_sync', ?)",
        ).bind(new Date().toISOString()).run();
        const result = await runSyncOneRepo(env);
        return Response.json(result);
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

  /* ── Cron — every 4 hours ──────────────────────────────────── */
  async scheduled(_event: ScheduledEvent, env: Env, _ctx: ExecutionContext): Promise<void> {
    console.log('Starting scheduled GitHub sync...');
    if (env.DB) {
      await env.DB.prepare(
        "INSERT OR REPLACE INTO sync_state (key, value) VALUES ('sync_running', '1')",
      ).run();
    }
    const result = await runSync(env);
    console.log('Sync result:', JSON.stringify(result));
  },
};

// Re-export ALLOWED_ORIGINS for use in any future edge middleware
export { ALLOWED_ORIGINS };
