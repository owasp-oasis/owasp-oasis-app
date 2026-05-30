/**
 * GitHub sync engine: full cron sync, chunked manual sync, shared PR processor.
 */

import type { Env, SyncResult, SyncStats, ParticipantData, PRResult } from './types.js';
import {
  getSyncState, setSyncState, rebuildContributors,
  upsertRepo, upsertPR, upsertParticipants, updateRepoPRCount, getExistingMergedUpstream,
} from './db.js';
import {
  ORG, META_REPOS,
  ghFetch, ghFetchAll,
  parseDecision, parseDetectionTool, isAutomatedAccount,
  type GitHubRepo, type GitHubPR, type GitHubComment, type GitHubReaction,
} from './github.js';

/* ─── CHUNKED SYNC CONFIG ────────────────────────────────────── */
// Each /leaderboard-refresh call processes up to CHUNK_SIZE PRs.
// Cursor is stored in sync_state as "repoIndex:prStart".
const CHUNK_SIZE = 10;

/* ─── SHARED PR PROCESSOR ────────────────────────────────────── */
// Contains the inner loop logic shared between runSync and runSyncOneRepo.
// skipReactions = true on manual sync (50-subrequest limit); false on cron (1000 limit).
async function processPR(
  pr: GitHubPR,
  repoName: string,
  db: D1Database,
  token: string,
  syncStart: string,
  opts: { skipReactions: boolean },
): Promise<PRResult> {
  const participantMap = new Map<string, ParticipantData>();
  const ensure = (login: string): ParticipantData => {
    if (!participantMap.has(login)) {
      participantMap.set(login, { interactions: 0, non_oasis_interactions: 0, decision: null, reactions_received: 0 });
    }
    return participantMap.get(login)!;
  };

  const comments = await ghFetchAll<GitHubComment>(
    `/repos/${ORG}/${repoName}/issues/${pr.number}/comments`, token,
  );

  let consensusAccept = 0, consensusModify = 0, consensusReject = 0;
  let oasisCommentCount = 0, nonOasisCommentCount = 0;

  for (const comment of comments) {
    const login = comment.user?.login;
    // Skip automated/bot accounts — they must not appear in any OASIS tracking
    if (!login || isAutomatedAccount(login)) continue;
    const p = ensure(login);
    const decision = parseDecision(comment.body);

    if (decision) {
      // OASIS-template comment — counts toward interactions, consensus, and trust
      p.interactions++;
      p.decision = decision;
      oasisCommentCount++;
      if (decision === 'accept') consensusAccept++;
      if (decision === 'modify') consensusModify++;
      if (decision === 'reject') consensusReject++;
    } else {
      // Non-OASIS comment — tracked separately, does NOT affect reputation,
      // consensus, trust status, or contributor counts
      p.non_oasis_interactions++;
      nonOasisCommentCount++;
      continue; // skip reactions fetch — non-OASIS engagement is not credited
    }

    // Reactions are only fetched for OASIS-template comments.
    // Skipped on manual sync to stay within the 50-subrequest limit;
    // the cron (1000-subrequest limit) always fetches them.
    if (!opts.skipReactions) {
      try {
        const reactions = await ghFetchAll<GitHubReaction>(
          `/repos/${ORG}/${repoName}/issues/comments/${comment.id}/reactions`, token,
        );
        for (const rxn of reactions) {
          const rLogin = rxn.user?.login;
          // Skip self-reactions, bots, and automated accounts
          if (!rLogin || rLogin === login || isAutomatedAccount(rLogin)) continue;
          p.reactions_received++;
          if (rxn.content === '+1' && decision) {
            if (decision === 'accept') consensusAccept++;
            if (decision === 'modify') consensusModify++;
            if (decision === 'reject') consensusReject++;
          }
          ensure(rLogin).interactions++;
        }
      } catch { /* skip — non-fatal */ }
    }
  }

  // participants = only those who left at least one OASIS-template comment
  const oasisParticipantCount = [...participantMap.values()].filter(p => p.decision !== null).length;
  const detectionTool  = parseDetectionTool(pr.body);
  const mergedUpstream = await getExistingMergedUpstream(db, repoName, pr.number);

  await upsertPR(
    db, pr, repoName, comments.length,
    oasisCommentCount, nonOasisCommentCount,
    oasisParticipantCount, consensusAccept, consensusModify, consensusReject,
    mergedUpstream, detectionTool, syncStart,
  );

  await upsertParticipants(db, pr.id, repoName, pr.number, participantMap);

  return { comments: comments.length };
}

/* ─── FULL SYNC (cron — 1000 subrequest limit) ───────────────── */
export async function runSync(env: Env, opts: { skipReactions?: boolean } = {}): Promise<SyncResult> {
  const { skipReactions = false } = opts;
  const token = env.GITHUB_TOKEN;
  const db    = env.DB;
  const stats: SyncStats = { repos: 0, prs: 0, comments: 0 };

  try {
    const since     = await getSyncState(db, 'last_synced_at');
    const syncStart = new Date().toISOString();
    const allRepos  = await ghFetchAll<GitHubRepo>(`/orgs/${ORG}/repos?type=public`, token);
    const repos     = allRepos.filter(r => r.fork && !META_REPOS.has(r.name));

    for (const repo of repos) {
      const detail      = await ghFetch<{ parent?: { html_url: string } }>(`/repos/${ORG}/${repo.name}`, token);
      const upstreamUrl = detail.parent?.html_url ?? null;

      await upsertRepo(db, repo, upstreamUrl, syncStart);
      stats.repos++;

      const openPRs   = await ghFetchAll<GitHubPR>(`/repos/${ORG}/${repo.name}/pulls?state=open&sort=updated&direction=desc`, token);
      const closedPRs = await ghFetchAll<GitHubPR>(`/repos/${ORG}/${repo.name}/pulls?state=closed&sort=updated&direction=desc`, token);
      const prs       = [...openPRs, ...closedPRs].filter(pr => pr.updated_at >= since);

      for (const pr of prs) {
        stats.prs++;
        const result = await processPR(pr, repo.name, db, token, syncStart, { skipReactions });
        stats.comments += result.comments;
      }

      await updateRepoPRCount(db, repo.name, syncStart);
    }

    await rebuildContributors(db, syncStart);
    await setSyncState(db, 'last_synced_at', syncStart);
    await setSyncState(db, 'sync_running', '0');
    return { ok: true, message: `Sync complete at ${syncStart}`, stats };
  } catch (err) {
    await setSyncState(db, 'sync_running', '0');
    return { ok: false, message: (err as Error)?.message ?? String(err), stats };
  }
}

/* ─── CHUNKED MANUAL SYNC (10 PRs per call — 50 subrequest limit) */
// Cursor stored in sync_state as "repoIndex:prStart", e.g. "0:10".
// Each call processes up to CHUNK_SIZE PRs from the current repo, then advances.
// When all PRs in a repo are done, moves to next repo.
// When all repos done, runs rebuildContributors and marks sync complete.
export async function runSyncOneRepo(env: Env): Promise<SyncResult> {
  const token = env.GITHUB_TOKEN;
  const db    = env.DB;
  const stats: SyncStats = { repos: 0, prs: 0, comments: 0 };

  try {
    const since     = await getSyncState(db, 'last_synced_at');
    const syncStart = new Date().toISOString();

    // Fetch repo list (1 subrequest)
    const allRepos = await ghFetchAll<GitHubRepo>(`/orgs/${ORG}/repos?type=public`, token);
    const repos    = allRepos.filter(r => r.fork && !META_REPOS.has(r.name));

    if (repos.length === 0) {
      return { ok: true, message: 'No repos to sync', stats, done: true };
    }

    // Parse cursor "repoIndex:prStart"
    const cursorRow = await db.prepare("SELECT value FROM sync_state WHERE key = 'sync_cursor'")
      .first<{ value: string }>();
    let repoIdx = 0, prStart = 0;
    if (cursorRow?.value) {
      const parts = cursorRow.value.split(':');
      repoIdx  = parseInt(parts[0], 10) || 0;
      prStart  = parseInt(parts[1], 10) || 0;
    }

    // All repos processed — rebuild contributors and finish
    if (repoIdx >= repos.length) {
      await rebuildContributors(db, syncStart);
      await setSyncState(db, 'last_synced_at', syncStart);
      await setSyncState(db, 'sync_running', '0');
      await db.prepare("DELETE FROM sync_state WHERE key = 'sync_cursor'").run();
      return { ok: true, message: `Sync complete at ${syncStart}`, stats, done: true };
    }

    const repo = repos[repoIdx];

    // First chunk for this repo: upsert repo row + fetch PR list
    if (prStart === 0) {
      const detail      = await ghFetch<{ parent?: { html_url: string } }>(`/repos/${ORG}/${repo.name}`, token);
      const upstreamUrl = detail.parent?.html_url ?? null;
      await upsertRepo(db, repo, upstreamUrl, syncStart);
      stats.repos++;
    }

    // Fetch all PRs for this repo (1-2 subrequests, paginated)
    const openPRs   = await ghFetchAll<GitHubPR>(`/repos/${ORG}/${repo.name}/pulls?state=open&sort=updated&direction=desc`, token);
    const closedPRs = await ghFetchAll<GitHubPR>(`/repos/${ORG}/${repo.name}/pulls?state=closed&sort=updated&direction=desc`, token);
    const allPRs    = [...openPRs, ...closedPRs].filter(pr => pr.updated_at >= since);

    // Slice this chunk
    const chunk   = allPRs.slice(prStart, prStart + CHUNK_SIZE);
    const prEnd   = prStart + chunk.length;
    const hasMore = prEnd < allPRs.length;

    for (const pr of chunk) {
      stats.prs++;
      // Reactions always skipped on manual chunked sync — cron handles them
      const result = await processPR(pr, repo.name, db, token, syncStart, { skipReactions: true });
      stats.comments += result.comments;
    }

    // After last chunk for this repo: update open_prs count
    if (!hasMore) {
      await updateRepoPRCount(db, repo.name, syncStart);
    }

    // Advance cursor
    const nextRepoIdx  = hasMore ? repoIdx : repoIdx + 1;
    const nextPrStart  = hasMore ? prEnd : 0;
    await setSyncState(db, 'sync_cursor', `${nextRepoIdx}:${nextPrStart}`);

    const reposLeft = repos.length - nextRepoIdx;
    const prsLeft   = hasMore ? allPRs.length - prEnd : 0;
    const msg = hasMore
      ? `Repo ${repoIdx + 1}/${repos.length} (${repo.name}): PRs ${prStart + 1}–${prEnd}/${allPRs.length}. ${prsLeft} PRs remaining in this repo.`
      : nextRepoIdx < repos.length
        ? `Repo ${repoIdx + 1}/${repos.length} (${repo.name}) done. ${reposLeft} repo(s) remaining.`
        : `All repos done. Call once more to rebuild contributors and finish.`;

    return { ok: true, message: msg, stats, done: false, cursor: `${nextRepoIdx}:${nextPrStart}`, total_repos: repos.length };
  } catch (err) {
    await setSyncState(db, 'sync_running', '0');
    return { ok: false, message: (err as Error)?.message ?? String(err), stats };
  }
}
