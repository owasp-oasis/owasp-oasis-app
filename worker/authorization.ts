import type { Env, OrphanCleanupActor } from './types.js';
import { getSession, type SessionUser, type UserRole } from './handlers/auth.js';

const ROLE_LEVEL: Record<UserRole, number> = {
  guest: 0,
  member: 1,
  moderator: 2,
  admin: 3,
};

export interface RequestPrincipal {
  role: UserRole;
  session: SessionUser | null;
}

export async function getRequestPrincipal(request: Request, env: Env): Promise<RequestPrincipal> {
  const session = await getSession(request, env);
  return session ? { role: session.role, session } : { role: 'guest', session: null };
}

export function roleAllows(actual: UserRole, required: UserRole): boolean {
  return ROLE_LEVEL[actual] >= ROLE_LEVEL[required];
}

export async function recordPrivilegedAction(
  env: Env,
  principal: RequestPrincipal,
  input: {
    action: string;
    targetType?: string;
    targetId?: string;
    outcome: 'accepted' | 'succeeded' | 'failed' | 'rejected';
  },
): Promise<void> {
  if (!principal.session) return;
  return recordPrivilegedActionForActor(env, {
    githubUserId: principal.session.github_user_id,
    githubLogin: principal.session.github_login,
    role: principal.role,
  }, input);
}

export async function recordPrivilegedActionForActor(
  env: Env,
  actor: OrphanCleanupActor,
  input: {
    action: string;
    targetType?: string;
    targetId?: string;
    outcome: 'accepted' | 'succeeded' | 'failed' | 'rejected';
  },
): Promise<void> {
  await env.DB.prepare(`
    INSERT INTO privileged_action_audit (
      id, github_user_id, github_login, role, action,
      target_type, target_id, outcome, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    crypto.randomUUID(),
    actor.githubUserId,
    actor.githubLogin,
    actor.role,
    input.action.slice(0, 100),
    input.targetType?.slice(0, 80) ?? null,
    input.targetId?.slice(0, 160) ?? null,
    input.outcome,
    new Date().toISOString(),
  ).run();
}
