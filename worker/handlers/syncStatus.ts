import type { Env } from '../types.js';
import { secHeaders } from '../security.js';
import { getSyncRunDetail, getSyncStatus } from '../syncJobs.js';

function statusResponse(data: unknown, request: Request, status = 200): Response {
  const response = secHeaders(Response.json(data, { status }), request);
  response.headers.set('Cache-Control', 'public, max-age=15, stale-while-revalidate=15');
  return response;
}

export async function handleSyncStatus(request: Request, env: Env): Promise<Response> {
  return statusResponse(await getSyncStatus(env), request);
}

export async function handleSyncRunDetail(
  request: Request,
  env: Env,
  runId: string,
): Promise<Response> {
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(runId)) {
    return statusResponse({ ok: false, error: 'Invalid run ID' }, request, 400);
  }
  const detail = await getSyncRunDetail(env, runId);
  if (!detail) return statusResponse({ ok: false, error: 'Sync run not found' }, request, 404);
  return statusResponse(detail, request);
}
