import type { Env } from './types.js';

export const TEAM_BADGE_THRESHOLDS = [3, 5, 10, 25] as const;
export type TeamBadgeThreshold = typeof TEAM_BADGE_THRESHOLDS[number];
export type TeamBadgeKey = 'membership' | 'contributor_milestone';

export interface TeamBadge {
  id: number;
  team_id: number;
  github_login: string;
  badge_key: TeamBadgeKey;
  qualifying_count: number;
  threshold: number | null;
  awarded_at: string;
}

export interface TeamBadgeSettings {
  contribution_threshold: TeamBadgeThreshold;
  updated_at: string;
}

export function isTeamBadgeThreshold(value: unknown): value is TeamBadgeThreshold {
  return typeof value === 'number' && TEAM_BADGE_THRESHOLDS.includes(value as TeamBadgeThreshold);
}

/** Backfill and award earned badges idempotently for one current member. */
export async function syncTeamBadges(env: Env, teamId: number, githubLogin: string): Promise<void> {
  const timestamp = new Date().toISOString();
  await env.DB.prepare(
    `INSERT OR IGNORE INTO team_badges
       (team_id, github_login, badge_key, qualifying_count, threshold, awarded_at)
     SELECT ?, ?, 'membership', 0, NULL, MIN(joined_at)
       FROM team_memberships
      WHERE team_id = ? AND github_login = ? AND left_at IS NULL`,
  ).bind(teamId, githubLogin, teamId, githubLogin).run();

  const settings = await env.DB.prepare(
    'SELECT contribution_threshold FROM team_badge_settings WHERE team_id = ?',
  ).bind(teamId).first<{ contribution_threshold: number }>();
  const threshold = settings?.contribution_threshold ?? 5;
  const count = await env.DB.prepare(
    `SELECT COUNT(*) AS count FROM user_votes
      WHERE team_id = ? AND github_login = ?`,
  ).bind(teamId, githubLogin).first<{ count: number }>();
  const qualifyingCount = Number(count?.count ?? 0);
  if (qualifyingCount < threshold) return;

  await env.DB.prepare(
    `INSERT OR IGNORE INTO team_badges
       (team_id, github_login, badge_key, qualifying_count, threshold, awarded_at)
     VALUES (?, ?, 'contributor_milestone', ?, ?, ?)`,
  ).bind(teamId, githubLogin, qualifyingCount, threshold, timestamp).run();
}

export async function listTeamBadges(env: Env, teamId: number, githubLogin: string): Promise<TeamBadge[]> {
  const rows = await env.DB.prepare(
    `SELECT id, team_id, github_login, badge_key, qualifying_count, threshold, awarded_at
       FROM team_badges WHERE team_id = ? AND github_login = ? ORDER BY awarded_at`,
  ).bind(teamId, githubLogin).all<TeamBadge>();
  return rows.results ?? [];
}
