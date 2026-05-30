/**
 * GitHub sync engine: full cron sync, chunked manual sync, shared PR processor.
 *
 * Data collection per PR:
 *   1. Fetch all comments → identify OASIS-template comments via parseDecision()
 *   2. For each OASIS comment: store pr_comments row, fetch reactions, store comment_reactions rows
 *   3. Track reactions_given per reactor (counts reactions they gave on OTHERS' comments)
 *   4. Detect upstream merges for closed PRs using the parent repo's commit API
 *
 * Reputation computation runs in rebuildContributors() after all PRs are processed.
 */

import type { Env, SyncResult, SyncStats, ParticipantData, PRResult } from './types.js';
import {
  getSyncState, setSyncState, rebuildContributors,
  upsertRepo, upsertPR, upsertParticipants, upsertComments, upsertReactions,
  updateRepoPRCount, getExistingMergedUpstream,
} from './db.js';
import {
  ORG, META_REPOS,
  ghFetch, ghFetchAll,
  parseDecision, parseDetectionTool, isAutomatedAccount, reactionPolarity,
  isHeadMergedUpstream, parseGitHubUrl,
  type GitHubRepo, type GitHubPR, type GitHubComment, type GitHubReaction,
} from './github.js';
import type { CommentData, ReactionData } from './types.js';

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
  upstreamUrl: string | null,
  db: D1Database,
  token: string,
  syncStart: string,
  opts: { skipReactions: boolean },
): Promise<PRResult> {
  const participantMap = new Map<string, ParticipantData>();
  const ensure = (login: string): ParticipantData => {
    if (!participantMap.has(login)) {
      participantMap.set(login, {
        interactions: 0,
        non_oasis_interactions: 0,
        decision: null,
        reactions_received: 0,
        reactions_given: 0,
      });
    }
    return participantMap.get(login)!;
  };

  const comments = await ghFetchAll<GitHubComment>(
    `/repos/${ORG}/${repoName}/issues/${pr.number}/comments`, token,
  );

  let consensusAccept = 0, consensusModify = 0, consensusReject = 0;
  let oasisCommentCount = 0, nonOasisCommentCount = 0;

  // Collect granular comment/reaction data for insertion into pr_comments / comment_reactions
  const commentRows: CommentData[] = [];
  const reactionRows: ReactionData[] = [];

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

      // Store per-comment record for bonus computation and contribution history
      commentRows.push({
        id: comment.id,
        prId: pr.id,
        repoName,
        prNumber: pr.number,
        login,
        decision,
        createdAt: comment.created_at,
        prCreatedAt: pr.created_at,
      });

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

            // Consensus weighting: +1 reactions on OASIS comments count toward consensus
            if (rxn.content === '+1' && decision) {
              if (decision === 'accept') consensusAccept++;
              if (decision === 'modify') consensusModify++;
              if (decision === 'reject') consensusReject++;
            }

            // Track how many reactions this reactor has GIVEN (for reaction_score)
            ensure(rLogin).reactions_given++;

            // Store per-reaction record for peer_score computation
            const polarity = reactionPolarity(rxn.content);
            reactionRows.push({
              commentId: comment.id,
              reactor: rLogin,
              content: rxn.content,
              isPositive: polarity === 'positive',
            });
          }
        } catch { /* skip — non-fatal */ }
      }
    } else {
      // Non-OASIS comment — tracked separately, does NOT affect reputation,
      // consensus, trust status, or contributor counts
      p.non_oasis_interactions++;
      nonOasisCommentCount++;
      // skip reactions fetch — non-OASIS engagement is not credited
    }
  }

  // participants = only those who left at least one OASIS-template comment
  const oasisParticipantCount = [...participantMap.values()].filter(p => p.decision !== null).length;
  const detectionTool = parseDetectionTool(pr.body);

  // ── Upstream merge detection ─────────────────────────────────
  // If the PR is closed/merged and we don't already have merged_upstream=1,
  // check whether the head commit exists in the upstream (parent) repo.
  // This powers trust_score: contributors who voted 'accept' on an upstream-merged PR earn +10.
  let mergedUpstream = await getExistingMergedUpstream(db, repoName, pr.number);
  if (mergedUpstream === 0 && pr.merged_at && pr.head?.sha && upstreamUrl) {
    const parsed = parseGitHubUrl(upstreamUrl);
    if (parsed) {
      const isMerged = await isHeadMergedUpstream(parsed.owner, parsed.repo, pr.head.sha, token);
      if (isMerged) mergedUpstream = 1;
    }
  }

  await upsertPR(
    db, pr, repoName, comments.length,
    oasisCommentCount, nonOasisCommentCount,
    oasisParticipantCount, consensusAccept, consensusModify, consensusReject,
    mergedUpstream, detectionTool, syncStart,
  );

  await upsertParticipants(db, pr.id, repoName, pr.number, participantMap);

  // Write granular comment/reaction rows (used by rebuildContributors for bonus computation)
  if (commentRows.length > 0) {
    await upsertComments(db, commentRows);
  }
  if (reactionRows.length > 0) {
    await upsertReactions(db, reactionRows);
  }

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
        const result = await processPR(pr, repo.name, upstreamUrl, db, token, syncStart, { skipReactions });
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
    let upstreamUrl: string | null = null;

    // First chunk for this repo: upsert repo row + fetch PR list
    if (prStart === 0) {
      const detail = await ghFetch<{ parent?: { html_url: string } }>(`/repos/${ORG}/${repo.name}`, token);
      upstreamUrl  = detail.parent?.html_url ?? null;
      await upsertRepo(db, repo, upstreamUrl, syncStart);
      stats.repos++;
    } else {
      // Subsequent chunks: read upstream_url from DB (already stored on first chunk)
      const repoRow = await db.prepare('SELECT upstream_url FROM repos WHERE name = ?')
        .bind(repo.name).first<{ upstream_url: string | null }>();
      upstreamUrl = repoRow?.upstream_url ?? null;
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
      const result = await processPR(pr, repo.name, upstreamUrl, db, token, syncStart, { skipReactions: true });
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
