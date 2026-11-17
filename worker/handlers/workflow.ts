/**
 * Maintainer disposition and upstream-submission workflow.
 *
 * This is deliberately separate from validator votes and reputation. A vote
 * describes community review; a maintainer decision describes whether the
 * candidate should move toward an upstream repository; the upstream record
 * describes what happened in that separate GitHub PR.
 */

import type { Env } from '../types.js';
import { ghFetch, parseGitHubUrl, ORG } from '../github.js';
import { getRequestPrincipal, roleAllows, recordPrivilegedAction } from '../authorization.js';
import { jsonErr, jsonOk, validateCSRF } from '../security.js';
import { isMissingSchemaObject } from '../schemaCompatibility.js';

const DECISIONS = new Set(['changes_requested', 'accepted', 'declined']);
const TRUST_MIN_CONTRIBUTORS = 10;
const TRUST_MIN_ACCEPT_RATE = 0.75;

type MaintainerDecision = 'changes_requested' | 'accepted' | 'declined';
type UpstreamStatus = 'pending' | 'open' | 'changes_requested' | 'merged' | 'closed' | 'failed';

interface PRWorkflowRow {
  id: number;
  repo_name: string;
  number: number;
  title: string;
  state: string;
  html_url: string | null;
  head_sha: string | null;
  updated_at: string | null;
  upstream_url: string | null;
  participants: number;
  consensus_accept: number;
  consensus_modify: number;
  consensus_reject: number;
}

interface DecisionRow {
  id: string;
  decision: MaintainerDecision;
  reason: string;
  head_sha: string | null;
  github_user_id: number | null;
  github_login: string;
  created_at: string;
}

interface SubmissionRow {
  id: string;
  source_pr_id: number;
  upstream_full_name: string;
  upstream_default_branch: string;
  upstream_pr_id: number | null;
  upstream_pr_number: number | null;
  upstream_pr_node_id: string | null;
  upstream_pr_url: string | null;
  head_repo_full_name: string;
  head_branch: string;
  validated_head_sha: string;
  base_branch: string;
  status: UpstreamStatus;
  close_reason: string | null;
  close_reason_text: string | null;
  last_review_state: string | null;
  last_reviewed_by: string | null;
  last_reviewed_at: string | null;
  last_review_url: string | null;
  submitted_by_github_id: number | null;
  submitted_by_login: string;
  submitted_at: string | null;
  last_synced_at: string | null;
  error_summary: string | null;
  created_at: string;
  updated_at: string;
}

interface GitHubSourcePR {
  number: number;
  title: string;
  state: string;
  html_url: string;
  body: string | null;
  head?: { sha?: string; ref?: string; repo?: { full_name?: string } | null };
}

interface GitHubUpstreamRepo {
  full_name?: string;
  default_branch?: string;
}

interface GitHubUpstreamPR {
  id: number;
  node_id?: string;
  number: number;
  state: string;
  html_url: string;
  merged_at?: string | null;
  updated_at?: string;
  body?: string | null;
  head?: { sha?: string; ref?: string; repo?: { full_name?: string } | null };
  base?: { ref?: string };
}

interface GitHubReview {
  id: number;
  user?: { login?: string };
  state?: string;
  html_url?: string;
  submitted_at?: string;
}

async function getPR(env: Env, prId: number): Promise<PRWorkflowRow | null> {
  return env.DB.prepare(`
    SELECT p.id, p.repo_name, p.number, p.title, p.state, p.html_url, p.head_sha, p.updated_at,
           p.participants, p.consensus_accept, p.consensus_modify, p.consensus_reject,
           r.upstream_url
      FROM pull_requests p
      LEFT JOIN repos r ON r.id = p.repo_id
     WHERE p.id = ? AND p.deleted = 0
  `).bind(prId).first<PRWorkflowRow>();
}

async function hasMaintainerCapability(
  env: Env,
  prId: number,
  githubUserId: number | null,
): Promise<boolean> {
  if (!githubUserId) return false;
  const target = await env.DB.prepare(`
    SELECT p.repo_id, r.upstream_url
      FROM pull_requests p JOIN repos r ON r.id = p.repo_id
     WHERE p.id = ? AND p.deleted = 0
  `).bind(prId).first<{ repo_id: number; upstream_url: string | null }>();
  const targetUpstream = target?.upstream_url ? parseGitHubUrl(target.upstream_url) : null;
  if (!target || !targetUpstream) return false;
  const registration = await env.DB.prepare(`
    SELECT upstream_full_name FROM verified_upstream_maintainers
     WHERE oasis_repo_id = ? AND github_user_id = ? AND removed_at IS NULL
     LIMIT 1
  `).bind(target.repo_id, githubUserId).first<{ upstream_full_name: string }>();
  return Boolean(registration &&
    registration.upstream_full_name.toLowerCase() === `${targetUpstream.owner}/${targetUpstream.repo}`.toLowerCase());
}

async function canManagePR(
  env: Env,
  pr: PRWorkflowRow,
  principal: Awaited<ReturnType<typeof getRequestPrincipal>>,
): Promise<boolean> {
  if (roleAllows(principal.role, 'admin')) return true;
  const githubUserId = principal.session?.github_user_id;
  const token = principal.session?.github_token;
  const parsed = pr.upstream_url ? parseGitHubUrl(pr.upstream_url) : null;
  if (!githubUserId || !token || !parsed || !await hasMaintainerCapability(env, pr.id, githubUserId)) return false;

  const registration = await env.DB.prepare(`
    SELECT upstream_repo_github_id FROM verified_upstream_maintainers
     WHERE oasis_repo_id = (SELECT repo_id FROM pull_requests WHERE id = ?)
       AND github_user_id = ? AND removed_at IS NULL
     LIMIT 1
  `).bind(pr.id, githubUserId).first<{ upstream_repo_github_id: number }>();
  if (!registration) return false;

  try {
    const upstream = await ghFetch<GitHubUpstreamRepo & { id: number; permissions?: { maintain?: boolean; admin?: boolean } }>(
      `/repos/${parsed.owner}/${parsed.repo}`, token,
    );
    const permission = upstream.permissions?.admin ? 'admin' : upstream.permissions?.maintain ? 'maintain' : null;
    if (upstream.id !== registration.upstream_repo_github_id || !permission) return false;
    await env.DB.prepare(`UPDATE verified_upstream_maintainers
       SET github_permission = ?, github_login = ?, verified_at = ?, updated_at = ?
     WHERE oasis_repo_id = (SELECT repo_id FROM pull_requests WHERE id = ?)
       AND github_user_id = ? AND removed_at IS NULL`).bind(
      permission, principal.session!.github_login, new Date().toISOString(), new Date().toISOString(), pr.id, githubUserId,
    ).run();
    return true;
  } catch {
    return false;
  }
}

async function getLatestDecision(env: Env, prId: number): Promise<DecisionRow | null> {
  try {
    return await env.DB.prepare(`
      SELECT id, decision, reason, head_sha, github_user_id, github_login, created_at
        FROM maintainer_decisions
       WHERE pr_id = ?
       ORDER BY created_at DESC, id DESC
       LIMIT 1
    `).bind(prId).first<DecisionRow>();
  } catch (error) {
    if (!isMissingSchemaObject(error)) throw error;
    return null;
  }
}

async function getLatestSubmission(env: Env, prId: number): Promise<SubmissionRow | null> {
  try {
    return await env.DB.prepare(`
      SELECT * FROM upstream_submissions
       WHERE source_pr_id = ?
       ORDER BY created_at DESC, id DESC
       LIMIT 1
    `).bind(prId).first<SubmissionRow>();
  } catch (error) {
    if (!isMissingSchemaObject(error)) throw error;
    return null;
  }
}

function communityReady(pr: PRWorkflowRow): boolean {
  const total = pr.consensus_accept + pr.consensus_modify + pr.consensus_reject;
  return pr.participants >= TRUST_MIN_CONTRIBUTORS &&
    total > 0 && pr.consensus_accept / total >= TRUST_MIN_ACCEPT_RATE;
}

function workflowStatus(
  pr: PRWorkflowRow,
  decision: DecisionRow | null,
  submission: SubmissionRow | null,
): string {
  const submissionIsCurrent = Boolean(submission && submission.validated_head_sha === pr.head_sha);
  if (submissionIsCurrent && submission?.status === 'merged') return 'Merged Upstream';
  if (submissionIsCurrent && submission?.status === 'changes_requested') return 'Upstream Changes Requested';
  if (submissionIsCurrent && submission?.status === 'pending') return 'Submission Pending Reconciliation';
  if (submissionIsCurrent && submission?.status === 'open') return 'Submitted Upstream';
  if (submissionIsCurrent && submission?.status === 'closed') return 'Closed Without Merge';
  if (decision?.decision === 'declined') return 'Maintainer Declined';
  if (decision?.decision === 'changes_requested') {
    return decision.head_sha && pr.head_sha && decision.head_sha !== pr.head_sha
      ? 'Maintainer Review'
      : 'Changes Requested';
  }
  if (decision?.decision === 'accepted') {
    return decision.head_sha && pr.head_sha && decision.head_sha === pr.head_sha
      ? 'Maintainer Accepted'
      : 'Maintainer Review';
  }
  if (communityReady(pr)) return 'Maintainer Review';
  return 'Needs Review';
}

function publicDecision(decision: DecisionRow | null) {
  return decision ? {
    id: decision.id,
    decision: decision.decision,
    reason: decision.reason,
    head_sha: decision.head_sha,
    github_login: decision.github_login,
    created_at: decision.created_at,
  } : null;
}

function publicSubmission(submission: SubmissionRow | null, includeErrorDetail: boolean) {
  if (!submission) return null;
  return {
    id: submission.id,
    upstream_full_name: submission.upstream_full_name,
    upstream_default_branch: submission.upstream_default_branch,
    upstream_pr_number: submission.upstream_pr_number,
    upstream_pr_node_id: submission.upstream_pr_node_id,
    upstream_pr_url: submission.upstream_pr_url,
    head_repo_full_name: submission.head_repo_full_name,
    head_branch: submission.head_branch,
    validated_head_sha: submission.validated_head_sha,
    base_branch: submission.base_branch,
    status: submission.status,
    close_reason: submission.close_reason,
    close_reason_text: submission.close_reason_text,
    last_review_state: submission.last_review_state,
    last_reviewed_by: submission.last_reviewed_by,
    last_reviewed_at: submission.last_reviewed_at,
    last_review_url: submission.last_review_url,
    submitted_by_login: submission.submitted_by_login,
    submitted_at: submission.submitted_at,
    last_synced_at: submission.last_synced_at,
    error_summary: includeErrorDetail ? submission.error_summary : null,
  };
}

function asWorkflowResponse(
  pr: PRWorkflowRow,
  decision: DecisionRow | null,
  submission: SubmissionRow | null,
  req: Request,
  includeErrorDetail = false,
): Response {
  return jsonOk({
    pr_id: pr.id,
    status: workflowStatus(pr, decision, submission),
    community_ready: communityReady(pr),
    maintainer_decision: publicDecision(decision),
    upstream_submission: publicSubmission(submission, includeErrorDetail),
  }, req);
}

async function refreshSubmission(env: Env, submission: SubmissionRow): Promise<SubmissionRow> {
  const parsed = parseGitHubUrl(`https://github.com/${submission.upstream_full_name}`);
  if (!parsed) return submission;
  if (!submission.upstream_pr_number && submission.status === 'pending') {
    const source = await env.DB.prepare('SELECT html_url FROM pull_requests WHERE id = ?')
      .bind(submission.source_pr_id).first<{ html_url: string | null }>();
    if (!source?.html_url) return submission;
    const head = `${submission.head_repo_full_name.split('/')[0]}:${submission.head_branch}`;
    try {
      const candidates = await ghFetch<GitHubUpstreamPR[]>(
        `/repos/${parsed.owner}/${parsed.repo}/pulls?state=all&head=${encodeURIComponent(head)}&base=${encodeURIComponent(submission.base_branch)}&per_page=100`,
        env.GITHUB_TOKEN,
      );
      const matches = candidates.filter(candidate =>
        candidate.head?.sha === submission.validated_head_sha &&
        candidate.head.ref === submission.head_branch &&
        candidate.head.repo?.full_name?.toLowerCase() === submission.head_repo_full_name.toLowerCase() &&
        candidate.base?.ref === submission.base_branch &&
        Boolean(candidate.body?.includes(`OASIS candidate PR ${source.html_url}`)),
      );
      if (matches.length === 1) {
        const recovered = matches[0];
        const now = new Date().toISOString();
        await env.DB.prepare(`
          UPDATE upstream_submissions
             SET upstream_pr_id = ?, upstream_pr_number = ?, upstream_pr_node_id = ?, upstream_pr_url = ?,
                 status = ?, submitted_at = COALESCE(submitted_at, ?), last_synced_at = ?,
                 updated_at = ?, error_summary = NULL
           WHERE id = ? AND status = 'pending'
        `).bind(
          recovered.id, recovered.number, recovered.node_id ?? null, recovered.html_url,
          recovered.merged_at ? 'merged' : recovered.state === 'closed' ? 'closed' : 'open',
          now, now, now, submission.id,
        ).run();
        return (await getLatestSubmission(env, submission.source_pr_id)) ?? submission;
      }
      if (matches.length > 1) {
        const now = new Date().toISOString();
        await env.DB.prepare(`UPDATE upstream_submissions SET error_summary = ?, last_synced_at = ?, updated_at = ? WHERE id = ?`)
          .bind('More than one GitHub pull request matched this pending submission; manual reconciliation is required.', now, now, submission.id).run();
      } else if (matches.length === 0) {
        const now = new Date().toISOString();
        await env.DB.prepare(`UPDATE upstream_submissions SET error_summary = ?, last_synced_at = ?, updated_at = ? WHERE id = ?`)
          .bind('No matching GitHub pull request is visible yet; OASIS will retry reconciliation before allowing another submission.', now, now, submission.id).run();
      }
    } catch (error) {
      const now = new Date().toISOString();
      await env.DB.prepare(`UPDATE upstream_submissions SET error_summary = ?, last_synced_at = ?, updated_at = ? WHERE id = ?`)
        .bind(`Could not reconcile pending GitHub submission: ${String((error as Error).message).slice(0, 400)}`, now, now, submission.id).run();
    }
    return (await getLatestSubmission(env, submission.source_pr_id)) ?? submission;
  }
  if (!submission.upstream_pr_number) return submission;
  const prPath = `/repos/${parsed.owner}/${parsed.repo}/pulls/${submission.upstream_pr_number}`;
  const now = new Date().toISOString();

  try {
    const upstreamPR = await ghFetch<GitHubUpstreamPR>(prPath, env.GITHUB_TOKEN);
    const reviews = await ghFetch<GitHubReview[]>(`${prPath}/reviews`, env.GITHUB_TOKEN);
    const submittedReviews = reviews
      .filter(review => Boolean(review.submitted_at))
      .sort((a, b) => String(a.submitted_at).localeCompare(String(b.submitted_at)));
    const latestReview = submittedReviews.at(-1);
    const status: UpstreamStatus = upstreamPR.merged_at
      ? 'merged'
      : upstreamPR.state === 'closed'
        ? 'closed'
        : latestReview?.state?.toUpperCase() === 'CHANGES_REQUESTED'
          ? 'changes_requested'
          : 'open';
    const closeReason = status === 'closed' ? (submission.close_reason ?? 'unknown') : null;

    await env.DB.prepare(`
      UPDATE upstream_submissions
         SET status = ?, close_reason = ?, last_review_state = ?, last_reviewed_by = ?,
             last_reviewed_at = ?, last_review_url = ?, last_synced_at = ?,
             error_summary = NULL, updated_at = ?
       WHERE id = ?
    `).bind(
      status,
      closeReason,
      latestReview?.state ?? null,
      latestReview?.user?.login ?? null,
      latestReview?.submitted_at ?? null,
      latestReview?.html_url ?? null,
      now,
      now,
      submission.id,
    ).run();

    if (status === 'merged') {
      await env.DB.prepare(`
        UPDATE pull_requests
           SET merged_upstream = 1, merged_at = COALESCE(merged_at, ?)
         WHERE id = ?
      `).bind(upstreamPR.merged_at ?? now, submission.source_pr_id).run();
    }
  } catch (error) {
    await env.DB.prepare(`
      UPDATE upstream_submissions
         SET error_summary = ?, last_synced_at = ?, updated_at = ?
       WHERE id = ?
    `).bind(String((error as Error).message).slice(0, 500), now, now, submission.id).run();
  }

  return (await getLatestSubmission(env, submission.source_pr_id)) ?? submission;
}

export async function handlePRWorkflow(request: Request, env: Env, prId: number): Promise<Response> {
  const pr = await getPR(env, prId);
  if (!pr) return jsonErr('PR not found', 404, request);
  const decision = await getLatestDecision(env, prId);
  let submission = await getLatestSubmission(env, prId);
  if (submission && ['pending', 'open', 'changes_requested'].includes(submission.status)) {
    submission = await refreshSubmission(env, submission);
  }
  return asWorkflowResponse(pr, decision, submission, request, false);
}

export async function handleValidationEvidence(request: Request, env: Env, prId: number): Promise<Response> {
  const principal = await getRequestPrincipal(request, env);
  if (!principal.session) return jsonErr('Sign in to view validation participants', 401, request);
  const pr = await getPR(env, prId);
  if (!pr) return jsonErr('PR not found', 404, request);
  if (!await canManagePR(env, pr, principal)) {
    return jsonErr('Current Maintain or Admin access to the configured upstream is required', 403, request);
  }
  const legacyVotes = await env.DB.prepare('SELECT COUNT(*) AS count FROM user_votes WHERE pr_id = ? AND head_sha IS NULL')
    .bind(prId).first<{ count: number }>();
  if (!pr.head_sha) return jsonOk({ pr_id: prId, head_sha: null, participants: [], counts: { accept: 0, modify: 0, reject: 0 }, historical_votes_unattributed: Number(legacyVotes?.count ?? 0) > 0, historical_vote_count: Number(legacyVotes?.count ?? 0) }, request, { cache: 'no-store' });

  const rows = await env.DB.prepare(`
    SELECT uv.github_login, uv.decision, uv.voted_at,
           c.avatar_url, COALESCE(c.modified_reputation, 0) AS reputation,
           COALESCE(c.prs_worked, 0) AS prs_worked, c.rank_90d,
           c.synced_at AS profile_synced_at
      FROM user_votes uv
      LEFT JOIN contributors c ON c.login = uv.github_login
     WHERE uv.pr_id = ? AND uv.head_sha = ?
       AND uv.decision IN ('accept', 'modify', 'reject')
     ORDER BY uv.voted_at ASC, uv.github_login ASC
  `).bind(prId, pr.head_sha).all<{
    github_login: string;
    decision: 'accept' | 'modify' | 'reject';
    voted_at: string;
    avatar_url: string | null;
    reputation: number;
    prs_worked: number;
    rank_90d: number | null;
    profile_synced_at: string | null;
  }>();
  const participants = rows.results ?? [];
  const counts = participants.reduce((total, participant) => {
    total[participant.decision] += 1;
    return total;
  }, { accept: 0, modify: 0, reject: 0 });
  return jsonOk({
    pr_id: prId,
    head_sha: pr.head_sha,
    participants,
    counts,
    // Older votes were not revision-bound and are deliberately omitted.
    historical_votes_unattributed: Number(legacyVotes?.count ?? 0) > 0,
    historical_vote_count: Number(legacyVotes?.count ?? 0),
  }, request, { cache: 'no-store' });
}

export async function handleMaintainerDecision(request: Request, env: Env, prId: number): Promise<Response> {
  const principal = await getRequestPrincipal(request, env);
  if (!principal.session) return jsonErr('Sign in to use maintainer actions', 401, request);
  if (!validateCSRF(request)) return jsonErr('Invalid or missing security token', 403, request);

  const pr = await getPR(env, prId);
  if (!pr) return jsonErr('PR not found', 404, request);
  if (!await canManagePR(env, pr, principal)) {
    await recordPrivilegedAction(env, principal, { action: 'maintainer_decision', targetType: 'pull_request', targetId: String(prId), outcome: 'failed' });
    return jsonErr('Current Maintain or Admin access to the configured upstream is required', 403, request);
  }
  if (pr.state !== 'open' || !pr.head_sha) return jsonErr('Only an open candidate with a known revision can receive a maintainer decision', 409, request);
  if (!principal.session.github_token) return jsonErr('Sign in again to verify the current GitHub revision', 403, request);
  let currentSource: GitHubSourcePR;
  try {
    currentSource = await ghFetch<GitHubSourcePR>(`/repos/${ORG}/${pr.repo_name}/pulls/${pr.number}`, principal.session.github_token);
  } catch {
    return jsonErr('Could not verify the current candidate revision on GitHub', 502, request);
  }
  if (currentSource.state !== 'open' || !currentSource.head?.sha || currentSource.head.sha !== pr.head_sha) {
    return jsonErr('The candidate changed on GitHub. Refresh the project data and review the current revision before deciding.', 409, request);
  }

  let body: { decision?: unknown; reason?: unknown };
  try {
    body = await request.json() as { decision?: unknown; reason?: unknown };
  } catch {
    return jsonErr('Invalid JSON body', 400, request);
  }
  const decision = String(body.decision ?? '') as MaintainerDecision;
  const reason = String(body.reason ?? '').trim();
  if (!DECISIONS.has(decision)) return jsonErr('Invalid maintainer decision', 400, request);
  if (reason.length < 1 || reason.length > 2000) return jsonErr('Reason must be between 1 and 2000 characters', 400, request);

  const latest = await getLatestDecision(env, prId);
  if (latest?.decision === decision && latest.reason === reason && latest.head_sha === pr.head_sha) {
    await recordPrivilegedAction(env, principal, {
      action: 'maintainer_decision', targetType: 'pull_request', targetId: String(prId), outcome: 'succeeded',
    });
    return asWorkflowResponse(pr, latest, await getLatestSubmission(env, prId), request, true);
  }

  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const inserted = await env.DB.prepare(`
    INSERT INTO maintainer_decisions
      (id, pr_id, decision, reason, head_sha, github_user_id, github_login, created_at)
    SELECT ?, ?, ?, ?, ?, ?, ?, ?
     WHERE EXISTS (SELECT 1 FROM pull_requests WHERE id = ? AND state = 'open' AND head_sha = ? AND deleted = 0)
  `).bind(
    id, prId, decision, reason, currentSource.head.sha, principal.session.github_user_id,
    principal.session.github_login, now, prId, currentSource.head.sha,
  ).run();
  if (!(inserted.meta?.changes ?? 0)) return jsonErr('The candidate changed while this decision was being saved. Refresh and review it again.', 409, request);

  await recordPrivilegedAction(env, principal, {
    action: 'maintainer_decision', targetType: 'pull_request', targetId: String(prId), outcome: 'succeeded',
  });
  return asWorkflowResponse(pr, await getLatestDecision(env, prId), await getLatestSubmission(env, prId), request, true);
}

export async function handleSubmitUpstream(request: Request, env: Env, prId: number): Promise<Response> {
  const principal = await getRequestPrincipal(request, env);
  if (!principal.session) return jsonErr('Sign in to submit upstream', 401, request);
  if (!validateCSRF(request)) return jsonErr('Invalid or missing security token', 403, request);
  if (!principal.session.github_token) return jsonErr('A GitHub sign-in with write access is required', 403, request);

  let body: { confirm?: unknown };
  try {
    body = await request.json() as { confirm?: unknown };
  } catch {
    return jsonErr('Invalid JSON body', 400, request);
  }
  if (body.confirm !== true) return jsonErr('Explicit confirmation is required', 400, request);

  const pr = await getPR(env, prId);
  if (!pr) return jsonErr('PR not found', 404, request);
  if (!await canManagePR(env, pr, principal)) {
    await recordPrivilegedAction(env, principal, { action: 'submit_upstream', targetType: 'pull_request', targetId: String(prId), outcome: 'failed' });
    return jsonErr('Current Maintain or Admin access to the configured upstream is required', 403, request);
  }
  const decision = await getLatestDecision(env, prId);
  if (decision?.decision !== 'accepted') {
    return jsonErr('The maintainer must accept this candidate before upstream submission', 409, request);
  }
  if (!decision.head_sha || !pr.head_sha || decision.head_sha !== pr.head_sha) {
    return jsonErr('The candidate revision changed after approval; review and accept the current revision before submission', 409, request);
  }
  const existing = await getLatestSubmission(env, prId);
  if (existing && ['pending', 'open', 'changes_requested'].includes(existing.status)) {
    const refreshed = existing.status === 'pending' ? await refreshSubmission(env, existing) : existing;
    return asWorkflowResponse(pr, decision, refreshed, request, true);
  }
  if (!pr.upstream_url) return jsonErr('No upstream repository is configured for this project', 409, request);
  if (pr.state !== 'open') return jsonErr('Only an open OASIS PR can be submitted upstream', 409, request);

  const upstream = parseGitHubUrl(pr.upstream_url);
  if (!upstream) return jsonErr('The project upstream repository URL is invalid', 409, request);

  let source: GitHubSourcePR;
  let upstreamRepo: GitHubUpstreamRepo;
  try {
    [source, upstreamRepo] = await Promise.all([
      ghFetch<GitHubSourcePR>(`/repos/${ORG}/${pr.repo_name}/pulls/${pr.number}`, env.GITHUB_TOKEN),
      ghFetch<GitHubUpstreamRepo>(`/repos/${upstream.owner}/${upstream.repo}`, env.GITHUB_TOKEN),
    ]);
  } catch (error) {
    await recordPrivilegedAction(env, principal, {
      action: 'submit_upstream', targetType: 'pull_request', targetId: String(prId), outcome: 'failed',
    });
    return jsonErr(`Could not load GitHub source data: ${(error as Error).message}`, 502, request);
  }

  const headRepo = source.head?.repo?.full_name;
  const headBranch = source.head?.ref;
  const headSha = source.head?.sha;
  const baseBranch = upstreamRepo.default_branch;
  if (!headRepo || !headBranch || !headSha || !baseBranch) {
    return jsonErr('GitHub did not provide a complete source branch or upstream base branch', 422, request);
  }
  if (source.state !== 'open') return jsonErr('The candidate PR is no longer open on GitHub', 409, request);
  if (headSha !== decision.head_sha) {
    return jsonErr('The candidate revision changed after approval; review and accept the current GitHub revision before submission', 409, request);
  }

  const now = new Date().toISOString();
  const submissionId = crypto.randomUUID();
  try {
    await env.DB.prepare(`
    INSERT INTO upstream_submissions (
      id, source_pr_id, upstream_full_name, upstream_default_branch,
      head_repo_full_name, head_branch, validated_head_sha, base_branch,
      status, submitted_by_github_id, submitted_by_login, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)
  `).bind(
    submissionId, prId, `${upstream.owner}/${upstream.repo}`, baseBranch,
    headRepo, headBranch, headSha, baseBranch,
    principal.session.github_user_id, principal.session.github_login, now, now,
    ).run();
  } catch (error) {
    // A concurrent request may have inserted the active row after our read.
    const concurrent = await getLatestSubmission(env, prId);
    if (concurrent && ['pending', 'open', 'changes_requested'].includes(concurrent.status)) {
      const refreshed = concurrent.status === 'pending' ? await refreshSubmission(env, concurrent) : concurrent;
      return asWorkflowResponse(pr, decision, refreshed, request, true);
    }
    throw error;
  }

  let createResponse: Response;
  try {
    createResponse = await fetch(`https://api.github.com/repos/${upstream.owner}/${upstream.repo}/pulls`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${principal.session.github_token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'oasis-worker-upstream/1.0',
    },
    body: JSON.stringify({
      title: source.title,
      body: `${source.body ?? ''}\n\n---\nSubmitted from OASIS candidate PR ${source.html_url}\nValidated head SHA: ${headSha}`.trim(),
      head: `${headRepo.split('/')[0]}:${headBranch}`,
      base: baseBranch,
    }),
    });
  } catch {
    // The request may have succeeded at GitHub even if the response was lost.
    // Keep the row pending and reconcile by source, head SHA, and base before any retry.
    const pending = await getLatestSubmission(env, prId);
    const reconciled = pending ? await refreshSubmission(env, pending) : null;
    await recordPrivilegedAction(env, principal, {
      action: 'submit_upstream', targetType: 'pull_request', targetId: String(prId), outcome: 'failed',
    });
    return asWorkflowResponse(pr, decision, reconciled, request, true);
  }

  if (!createResponse.ok) {
    const detail = (await createResponse.text()).slice(0, 500);
    if (createResponse.status >= 500) {
      const pending = await getLatestSubmission(env, prId);
      const reconciled = pending ? await refreshSubmission(env, pending) : null;
      await recordPrivilegedAction(env, principal, {
        action: 'submit_upstream', targetType: 'pull_request', targetId: String(prId), outcome: 'failed',
      });
      return asWorkflowResponse(pr, decision, reconciled, request, true);
    }
    await env.DB.prepare(`
      UPDATE upstream_submissions
         SET status = 'failed', error_summary = ?, updated_at = ?
       WHERE id = ?
    `).bind(`GitHub API ${createResponse.status}: ${detail}`, new Date().toISOString(), submissionId).run();
    await recordPrivilegedAction(env, principal, {
      action: 'submit_upstream', targetType: 'pull_request', targetId: String(prId), outcome: 'failed',
    });
    return jsonErr('GitHub could not create the upstream PR', 502, request);
  }

  let created: GitHubUpstreamPR;
  try {
    created = await createResponse.json() as GitHubUpstreamPR;
  } catch {
    const pending = await getLatestSubmission(env, prId);
    const reconciled = pending ? await refreshSubmission(env, pending) : null;
    await recordPrivilegedAction(env, principal, {
      action: 'submit_upstream', targetType: 'pull_request', targetId: String(prId), outcome: 'failed',
    });
    return asWorkflowResponse(pr, decision, reconciled, request, true);
  }
  if (!Number.isSafeInteger(created.id) || !Number.isSafeInteger(created.number) || !created.html_url) {
    const pending = await getLatestSubmission(env, prId);
    const reconciled = pending ? await refreshSubmission(env, pending) : null;
    await recordPrivilegedAction(env, principal, {
      action: 'submit_upstream', targetType: 'pull_request', targetId: String(prId), outcome: 'failed',
    });
    return asWorkflowResponse(pr, decision, reconciled, request, true);
  }
  await env.DB.prepare(`
      UPDATE upstream_submissions
         SET upstream_pr_id = ?, upstream_pr_number = ?, upstream_pr_node_id = ?, upstream_pr_url = ?,
           status = 'open', submitted_at = ?, last_synced_at = ?, updated_at = ?,
           error_summary = NULL
     WHERE id = ?
  `).bind(
    created.id, created.number, created.node_id ?? null, created.html_url, now, now, now, submissionId,
  ).run();
  await recordPrivilegedAction(env, principal, {
    action: 'submit_upstream', targetType: 'pull_request', targetId: String(prId), outcome: 'succeeded',
  });

  return asWorkflowResponse(pr, decision, await getLatestSubmission(env, prId), request, true);
}
