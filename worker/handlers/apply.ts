/** POST /api/apply — role application handler retained for API compatibility. */

import type { Env } from '../types.js';
import { checkRateLimit, jsonErr, jsonOk, validateCSRF } from '../security.js';
import { hashString, parseBody, vEmail, vGitHubAccount, vName, vRole, vText } from '../validation.js';
import { isAlreadyApplied } from '../db.js';
import {
  enqueueHubSpotSync,
  prepareHubSpotEnqueue,
  scheduleHubSpotSync,
  type HubSpotSubmission,
} from '../hubspot.js';

export async function handleApply(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  if (!validateCSRF(request)) return jsonErr('Invalid or missing security token', 403, request);

  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  const rl = await checkRateLimit(env, ip);
  if (!rl.allowed) return jsonErr('Too many requests — please wait a minute and try again.', 429, request);

  const parsed = await parseBody(request);
  if (!parsed.ok) return jsonErr(parsed.error, 400, request);
  const body = parsed.val;

  const nameRes = vName(body['name']);
  if (!nameRes.ok) return jsonErr(nameRes.error, 400, request);
  const emailRes = vEmail(body['email']);
  if (!emailRes.ok) return jsonErr(emailRes.error, 400, request);
  const orgRes = vText(body['org'], 120, 'Organisation');
  if (!orgRes.ok) return jsonErr(orgRes.error, 400, request);
  const whyRes = vText(body['why'], 1_000, 'Message');
  if (!whyRes.ok) return jsonErr(whyRes.error, 400, request);
  const roleRes = vRole(body['role']);
  if (!roleRes.ok || !roleRes.val) return jsonErr('Please select a role to apply for', 400, request);
  const ghRes = await vGitHubAccount(body['github'], env.GITHUB_TOKEN);
  if (!ghRes.ok) return jsonErr(ghRes.error, ghRes.status ?? 400, request);

  const submittedAt = new Date().toISOString();
  const submission: HubSpotSubmission = {
    source: 'application',
    email: emailRes.val,
    name: nameRes.val,
    github: ghRes.val,
    role: roleRes.val,
    organization: orgRes.val,
    submitted_at: submittedAt,
  };

  if (await isAlreadyApplied(env.DB, emailRes.val, roleRes.val)) {
    try {
      await enqueueHubSpotSync(env.DB, submission, new Date(submittedAt));
      scheduleHubSpotSync(ctx, env);
    } catch {
      console.error(JSON.stringify({ event: 'hubspot_enqueue_failed', source: 'application' }));
    }
    return jsonOk({ message: "You've already applied for this role. We'll review it soon!" }, request);
  }

  try {
    await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO applications (email, name, github, org, why, role, ip_hash, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        emailRes.val,
        nameRes.val,
        ghRes.val,
        orgRes.val,
        whyRes.val,
        roleRes.val,
        await hashString(ip),
        submittedAt,
      ),
      prepareHubSpotEnqueue(env.DB, submission, new Date(submittedAt)),
    ]);
    scheduleHubSpotSync(ctx, env);
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    console.error(JSON.stringify({ event: 'application_write_failed', reason: 'database_error' }));
    if (message.includes('UNIQUE') || message.includes('constraint')) {
      try {
        await enqueueHubSpotSync(env.DB, submission, new Date(submittedAt));
        scheduleHubSpotSync(ctx, env);
      } catch {
        console.error(JSON.stringify({ event: 'hubspot_enqueue_failed', source: 'application' }));
      }
      return jsonOk({ message: "You've already applied for this role. We'll review it soon!" }, request);
    }
    return jsonErr('Application failed — please try again.', 500, request);
  }

  return jsonOk({ message: "Application received! We'll be in touch when the project launches." }, request);
}
