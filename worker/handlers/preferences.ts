/**
 * User preferences handlers: GET and PUT
 *
 * GET /api/preferences/mine  → return user's saved preferences + current_version
 * PUT /api/preferences/mine  → upsert user's preferences (languages, severities, experience, onboarding_version)
 */

import type { Env } from '../types.js'
import { getSession } from './auth.js'
import { jsonOk, jsonErr } from '../security.js'
import { CURRENT_ONBOARDING_VERSION } from '../onboarding.js'

interface UserPreferences {
  languages?: string[] | null         // e.g., ["Python", "Go"]
  severities?: string[] | null        // e.g., ["critical", "high"]
  experience?: string | null          // "new" | "some" | "experienced"
  onboarding_version?: string         // e.g., "2026.07.005"
}

/**
 * GET /api/preferences/mine
 * Returns the logged-in user's preferences + current onboarding version
 * If user has no preferences row, returns defaults with current_version
 */
export async function handleGetPreferences(request: Request, env: Env): Promise<Response> {
  const session = await getSession(request, env)
  if (!session) {
    return jsonErr('not_authenticated', 401)
  }

  const row = await env.DB.prepare(
    'SELECT languages, severities, experience, onboarding_version FROM user_preferences WHERE github_login = ?'
  ).bind(session.github_login).first<{
    languages: string | null
    severities: string | null
    experience: string | null
    onboarding_version: string | null
  }>()

  const preferences = {
    languages: row?.languages ? JSON.parse(row.languages) : null,
    severities: row?.severities ? JSON.parse(row.severities) : null,
    experience: row?.experience ?? null,
    onboarding_version: row?.onboarding_version ?? null,
  }

  return jsonOk({
    preferences,
    current_version: CURRENT_ONBOARDING_VERSION,
  })
}

/**
 * PUT /api/preferences/mine
 * Upserts user preferences. Request body should contain any subset of:
 * { languages: string[], severities: string[], experience: string, onboarding_version: string }
 *
 * Example:
 * {
 *   "languages": ["Python", "Go"],
 *   "severities": ["high", "critical"],
 *   "experience": "new",
 *   "onboarding_version": "2026.07.005"
 * }
 */
export async function handlePutPreferences(request: Request, env: Env): Promise<Response> {
  const session = await getSession(request, env)
  if (!session) {
    return jsonErr('not_authenticated', 401)
  }

  let body: UserPreferences = {}
  try {
    body = await request.json()
  } catch {
    return jsonErr('invalid_json', 400)
  }

  const now = new Date().toISOString()

  // Serialize arrays to JSON strings for storage
  const languages = body.languages ? JSON.stringify(body.languages) : null
  const severities = body.severities ? JSON.stringify(body.severities) : null
  const experience = body.experience ?? null
  const onboarding_version = body.onboarding_version ?? CURRENT_ONBOARDING_VERSION

  // Upsert using INSERT OR REPLACE
  await env.DB.prepare(
    `INSERT OR REPLACE INTO user_preferences
     (github_login, languages, severities, experience, onboarding_version, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, COALESCE((SELECT created_at FROM user_preferences WHERE github_login = ?), ?), ?)`
  ).bind(
    session.github_login,
    languages,
    severities,
    experience,
    onboarding_version,
    session.github_login,
    now,
    now
  ).run()

  return jsonOk({
    success: true,
    preferences: {
      languages: body.languages ?? null,
      severities: body.severities ?? null,
      experience,
      onboarding_version,
    },
  })
}
