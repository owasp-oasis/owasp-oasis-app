/**
 * POST /api/register — user registration handler.
 */

import type { Env } from '../types.js';
import { validateCSRF, checkRateLimit, jsonOk, jsonErr } from '../security.js';
import { vEmail, vName, vGitHub, vRole, parseBody, hashString } from '../validation.js';
import { isEmailRegistered } from '../db.js';

export async function handleRegister(request: Request, env: Env): Promise<Response> {
  if (!validateCSRF(request)) return jsonErr('Invalid or missing security token', 403, request);

  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  const rl = await checkRateLimit(env, ip);
  if (!rl.allowed) return jsonErr('Too many requests — please wait a minute and try again.', 429, request);

  const parsed = await parseBody(request);
  if (!parsed.ok) return jsonErr(parsed.error, 400, request);
  const body = parsed.val;

  // name is optional for the React form (project-website style)
  const nameRaw = body['name'] ? body['name'] : (body['email'] ? String(body['email']).split('@')[0] : '');
  const nameRes = vName(nameRaw);
  if (!nameRes.ok) return jsonErr(nameRes.error, 400, request);

  const emailRes = vEmail(body['email']);
  if (!emailRes.ok) return jsonErr(emailRes.error, 400, request);

  const ghRes = vGitHub(body['github'] ?? '');
  if (!ghRes.ok) return jsonErr(ghRes.error, 400, request);

  // Accept both 'role' and 'type' fields for compatibility
  const roleVal = body['role'] ?? body['type'] ?? '';
  const roleRes = vRole(roleVal);
  if (!roleRes.ok) return jsonErr(roleRes.error, 400, request);

  const isDuplicate = await isEmailRegistered(env.DB, emailRes.val);
  if (isDuplicate) return jsonOk({ message: "You're already registered. We'll be in touch!" }, request);

  if (env.DB) {
    try {
      await env.DB.prepare(
        `INSERT INTO registrations (name, email, github, role, ip_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
      ).bind(nameRes.val, emailRes.val, ghRes.val, roleRes.val, await hashString(ip), new Date().toISOString()).run();
    } catch (err) {
      const msg = (err as Error)?.message ?? '';
      if (msg.includes('UNIQUE') || msg.includes('constraint')) {
        return jsonOk({ message: "You're already registered. We'll be in touch!" }, request);
      }
      console.error('DB error (register):', msg);
      return jsonErr('Registration failed — please try again.', 500, request);
    }
  }

  return jsonOk({ message: "Registered successfully. We'll be in touch!" }, request);
}
