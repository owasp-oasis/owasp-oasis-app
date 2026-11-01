import type { Env } from '../types.js';
import { getRequestPrincipal } from '../authorization.js';
import { jsonErr, jsonOk, validateCSRF } from '../security.js';
import { parseBody } from '../validation.js';
import { linkContributionProfile } from '../contributionIdentity.js';
import { validateOtherInterest, validateRoleInterests } from '../contributionRoles.js';

export async function contributionProfile(db: D1Database, id: number) {
  const profile = await db.prepare('SELECT github_user_id, github_login, interests, other_interest, interests_updated_at FROM contribution_profiles WHERE github_user_id = ?')
    .bind(id).first<{ github_user_id: number; github_login: string; interests: string; other_interest: string; interests_updated_at: string | null }>();
  if (!profile) return null;
  return { ...profile, interests: JSON.parse(profile.interests) };
}
export async function handleMyContributionRoles(request: Request, env: Env): Promise<Response> {
  const principal = await getRequestPrincipal(request, env);
  if (!principal.session) return jsonErr('Sign in to manage your role interests.', 401, request);
  const id = principal.session.github_user_id;
  if (!id) return jsonErr('Please sign out and sign in again to verify your GitHub identity.', 409, request);
  if (request.method === 'PUT') {
    if (!validateCSRF(request)) return jsonErr('Invalid security token', 403, request);
    const parsed = await parseBody(request);
    if (!parsed.ok) return jsonErr(parsed.error, 400, request);
    if (Object.keys(parsed.val).some(key => !['interests', 'other_interest'].includes(key))) return jsonErr('Only role interests can be updated here.', 400, request);
    const interests = validateRoleInterests(parsed.val.interests);
    if (!interests) return jsonErr('Invalid role interests', 400, request);
    const current = await env.DB.prepare('SELECT other_interest FROM contribution_profiles WHERE github_user_id = ?').bind(id).first<{ other_interest: string }>();
    const proposedOther = parsed.val.other_interest === undefined && interests.includes('other') ? current?.other_interest : parsed.val.other_interest;
    const otherInterest = validateOtherInterest(proposedOther, interests.includes('other'));
    if (!otherInterest.ok) return jsonErr(otherInterest.error, 400, request);
    const now = new Date().toISOString();
    await env.DB.prepare(`INSERT INTO contribution_profiles (github_user_id, github_login, interests, other_interest, interests_updated_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(github_user_id) DO UPDATE SET
      github_login = excluded.github_login, interests = excluded.interests, other_interest = excluded.other_interest, interests_updated_at = excluded.interests_updated_at`)
      .bind(id, principal.session.github_login, JSON.stringify(interests), otherInterest.val, now, now).run();
  } else {
    // Session identity is trusted; a typed signup handle is never an ownership claim.
    await linkContributionProfile(env.DB, id, principal.session.github_login);
  }
  return jsonOk({ profile: await contributionProfile(env.DB, id) }, request, { cache: 'no-store' });
}
