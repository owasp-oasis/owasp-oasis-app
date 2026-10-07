import type { Env } from '../types.js'
import { getSession } from './auth.js'
import { jsonOk, jsonErr, validateCSRF } from '../security.js'
import { WORKSPACE_DEFAULTS, validateWorkspacePreferences } from '../workspacePreferences.js'

export async function handleWorkspacePreferences(request: Request, env: Env): Promise<Response> {
  const session = await getSession(request, env)
  if (!session) return jsonErr('Authentication required', 401, request)
  if (request.method === 'PUT') {
    if (!validateCSRF(request)) return jsonErr('Invalid security token', 403, request)
    const raw = await request.text()
    if (raw.length > 16_384) return jsonErr('Preferences are too large', 413, request)
    let input: unknown
    try { input = JSON.parse(raw) } catch { return jsonErr('Invalid JSON', 400, request) }
    const patch = validateWorkspacePreferences(input)
    if (!patch) return jsonErr('Invalid Workspace preferences', 400, request)
    // json_patch merges independently edited fields atomically. Other preference
    // systems (onboarding and badge privacy) remain untouched.
    await env.DB.prepare(`INSERT INTO workspace_preferences (github_login, settings, updated_at)
      VALUES (?, ?, ?) ON CONFLICT(github_login) DO UPDATE SET
      settings = json_patch(workspace_preferences.settings, excluded.settings), updated_at = excluded.updated_at`)
      .bind(session.github_login, JSON.stringify(patch), new Date().toISOString()).run()
  }
  const row = await env.DB.prepare('SELECT settings FROM workspace_preferences WHERE github_login = ?')
    .bind(session.github_login).first<{ settings: string }>()
  return jsonOk({ preferences: { ...WORKSPACE_DEFAULTS, ...(row ? JSON.parse(row.settings) : {}) } }, request, { cache: 'no-store' })
}
