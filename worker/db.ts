/**
 * D1 database helpers: sync state, duplicate checks, contributor rebuild.
 */

import type { ParticipantData } from './types.js';

export async function getSyncState(db: D1Database, key: string): Promise<string> {
  const row = await db.prepare('SELECT value FROM sync_state WHERE key = ?').bind(key).first<{ value: string }>();
  return row?.value ?? '2020-01-01T00:00:00Z';
}

export async function setSyncState(db: D1Database, key: string, value: string): Promise<void> {
  await db.prepare('INSERT OR REPLACE INTO sync_state (key, value) VALUES (?, ?)').bind(key, value).run();
}

export async function isEmailRegistered(db: D1Database, email: string): Promise<boolean> {
  try {
    const row = await db.prepare('SELECT id FROM registrations WHERE email = ? LIMIT 1').bind(email).first();
    return !!row;
  } catch { return false; }
}

export async function rebuildContributors(db: D1Database, syncStart: string): Promise<void> {
  const rows = await db.prepare(`
    SELECT login,
           COUNT(DISTINCT pr_id)                                          AS prs_worked,
           SUM(interactions)                                               AS total_interactions,
           SUM(COALESCE(non_oasis_interactions, 0))                        AS non_oasis_interactions,
           SUM(reactions_received)                                          AS reactions_received,
           SUM(CASE WHEN decision = 'accept' THEN 1 ELSE 0 END)            AS accepts,
           SUM(CASE WHEN decision = 'modify' THEN 1 ELSE 0 END)            AS modifies,
           SUM(CASE WHEN decision = 'reject' THEN 1 ELSE 0 END)            AS rejects
    FROM pr_participants GROUP BY login
  `).all<{
    login: string;
    prs_worked: number;
    total_interactions: number;
    non_oasis_interactions: number;
    reactions_received: number;
    accepts: number;
    modifies: number;
    rejects: number;
  }>();

  for (const row of rows.results) {
    const existing = await db.prepare('SELECT avatar_url FROM contributors WHERE login = ?')
      .bind(row.login).first<{ avatar_url: string | null }>();
    await db.prepare(`
      INSERT OR REPLACE INTO contributors
        (login, avatar_url, prs_worked, total_interactions, non_oasis_interactions,
         reactions_received, accepts, modifies, rejects, synced_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      row.login,
      existing?.avatar_url ?? `https://github.com/${row.login}.png?size=64`,
      row.prs_worked, row.total_interactions, row.non_oasis_interactions ?? 0,
      row.reactions_received ?? 0,
      row.accepts, row.modifies, row.rejects, syncStart,
    ).run();
  }
}

export async function upsertRepo(
  db: D1Database,
  repo: {
    id: number;
    name: string;
    full_name: string;
    description: string | null;
    language: string | null;
    stargazers_count: number;
  },
  upstreamUrl: string | null,
  syncStart: string,
): Promise<void> {
  await db.prepare(`
    INSERT OR REPLACE INTO repos (id, name, full_name, description, language, open_prs, stars, upstream_url, synced_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    repo.id, repo.name, repo.full_name, repo.description ?? null,
    repo.language ?? null, 0, repo.stargazers_count, upstreamUrl, syncStart,
  ).run();
}

export async function upsertPR(
  db: D1Database,
  pr: {
    id: number;
    number: number;
    title: string;
    state: string;
    html_url: string;
    head?: { sha?: string };
    merged_at?: string | null;
    created_at: string;
    updated_at: string;
    user?: { login?: string };
  },
  repoName: string,
  commentCount: number,
  oasisCommentCount: number,
  nonOasisCommentCount: number,
  oasisParticipantCount: number,
  consensusAccept: number,
  consensusModify: number,
  consensusReject: number,
  mergedUpstream: number,
  detectionTool: string | null,
  syncStart: string,
): Promise<void> {
  const state = pr.state === 'open' ? 'open' : 'closed';
  await db.prepare(`
    INSERT OR REPLACE INTO pull_requests
      (id, repo_name, number, title, state, author, html_url, comment_count,
       oasis_comment_count, non_oasis_comment_count,
       participants, consensus_accept, consensus_modify, consensus_reject,
       merged_upstream, head_sha, merged_at, created_at, updated_at, detection_tool, synced_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    pr.id, repoName, pr.number, pr.title, state,
    pr.user?.login ?? null, pr.html_url, commentCount,
    oasisCommentCount, nonOasisCommentCount,
    oasisParticipantCount, consensusAccept, consensusModify, consensusReject,
    mergedUpstream, pr.head?.sha ?? null, pr.merged_at ?? null,
    pr.created_at, pr.updated_at, detectionTool, syncStart,
  ).run();
}

export async function upsertParticipants(
  db: D1Database,
  prId: number,
  repoName: string,
  prNumber: number,
  participantMap: Map<string, ParticipantData>,
): Promise<void> {
  for (const [login, data] of participantMap.entries()) {
    await db.prepare(`
      INSERT OR REPLACE INTO pr_participants
        (pr_id, repo_name, pr_number, login, interactions, non_oasis_interactions, decision, reactions_received)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(prId, repoName, prNumber, login, data.interactions, data.non_oasis_interactions, data.decision ?? null, data.reactions_received).run();
  }
}

export async function updateRepoPRCount(db: D1Database, repoName: string, syncStart: string): Promise<void> {
  const openCount = await db.prepare(
    "SELECT COUNT(*) as c FROM pull_requests WHERE repo_name = ? AND state = 'open'",
  ).bind(repoName).first<{ c: number }>();
  await db.prepare('UPDATE repos SET open_prs = ?, synced_at = ? WHERE name = ?')
    .bind(openCount?.c ?? 0, syncStart, repoName).run();
}

export async function getExistingMergedUpstream(db: D1Database, repoName: string, prNumber: number): Promise<number> {
  const row = await db.prepare('SELECT merged_upstream FROM pull_requests WHERE repo_name = ? AND number = ?')
    .bind(repoName, prNumber).first<{ merged_upstream: number }>();
  return row?.merged_upstream ?? 0;
}
