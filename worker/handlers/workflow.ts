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

async function getLatestDecision(env: Env, prId: number): Promise<DecisionRow | null> {
  return env.DB.prepare(`
    SELECT id, decision, reason, head_sha, github_user_id, github_login, created_at
      FROM maintainer_decisions
     WHERE pr_id = ?
     ORDER BY created_at DESC, id DESC
     LIMIT 1
  `).bind(prId).first<DecisionRow>();
}

async function getLatestSubmission(env: Env, prId: number): Promise<SubmissionRow | null> {
  return env.DB.prepare(`
    SELECT * FROM upstream_submissions
     WHERE source_pr_id = ?
     ORDER BY created_at DESC, id DESC
     LIMIT 1
  `).bind(prId).first<SubmissionRow>();
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
  if (submission?.status === 'merged') return 'Merged Upstream';
  if (submission?.status === 'changes_requested') return 'Upstream Changes Requested';
  if (submission?.status === 'open' || submission?.status === 'pending') return 'Submitted Upstream';
  if (submission?.status === 'closed') return 'Closed Without Merge';
  if (decision?.decision === 'declined') return 'Maintainer Declined';
  if (decision?.decision === 'changes_requested') {
    return decision.head_sha && pr.head_sha && decision.head_sha !== pr.head_sha
      ? 'Maintainer Review'
      : 'Changes Requested';
  }
  if (decision?.decision === 'accepted') return 'Maintainer Accepted';
  if (communityReady(pr)) return 'Maintainer Review';
  return 'Needs Review';
}

function publicDecision(decision: DecisionRow | null) {
  return decision ? {
    id: decision.id,
    decision: decision.decision,
    reason: decision.reason,
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
  if (!submission.upstream_pr_number) return submission;
  const parsed = parseGitHubUrl(`https://github.com/${submission.upstream_full_name}`);
  if (!parsed) return submission;
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

export async function handleMaintainerDecision(request: Request, env: Env, prId: number): Promise<Response> {
  const principal = await getRequestPrincipal(request, env);
  if (!principal.session) return jsonErr('Sign in to use maintainer actions', 401, request);
  if (!roleAllows(principal.role, 'admin')) return jsonErr('Admin role required for maintainer actions', 403, request);
  if (!validateCSRF(request)) return jsonErr('Invalid or missing security token', 403, request);

  const pr = await getPR(env, prId);
  if (!pr) return jsonErr('PR not found', 404, request);

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
  if (latest?.decision === decision && latest.reason === reason) {
    await recordPrivilegedAction(env, principal, {
      action: 'maintainer_decision', targetType: 'pull_request', targetId: String(prId), outcome: 'succeeded',
    });
    return asWorkflowResponse(pr, latest, await getLatestSubmission(env, prId), request, true);
  }

  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  await env.DB.prepare(`
    INSERT INTO maintainer_decisions
      (id, pr_id, decision, reason, head_sha, github_user_id, github_login, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, prId, decision, reason, pr.head_sha, principal.session.github_user_id,
    principal.session.github_login, now,
  ).run();

  await recordPrivilegedAction(env, principal, {
    action: 'maintainer_decision', targetType: 'pull_request', targetId: String(prId), outcome: 'succeeded',
  });
  return asWorkflowResponse(pr, await getLatestDecision(env, prId), await getLatestSubmission(env, prId), request, true);
}

export async function handleSubmitUpstream(request: Request, env: Env, prId: number): Promise<Response> {
  const principal = await getRequestPrincipal(request, env);
  if (!principal.session) return jsonErr('Sign in to submit upstream', 401, request);
  if (!roleAllows(principal.role, 'admin')) return jsonErr('Admin role required for upstream submission', 403, request);
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
  const decision = await getLatestDecision(env, prId);
  if (decision?.decision !== 'accepted') {
    return jsonErr('The maintainer must accept this candidate before upstream submission', 409, request);
  }
  const existing = await getLatestSubmission(env, prId);
  if (existing && ['pending', 'open', 'changes_requested'].includes(existing.status)) {
    return asWorkflowResponse(pr, decision, existing, request, true);
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

  const now = new Date().toISOString();
  const submissionId = crypto.randomUUID();
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

  const createResponse = await fetch(`https://api.github.com/repos/${upstream.owner}/${upstream.repo}/pulls`, {
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

  if (!createResponse.ok) {
    const detail = (await createResponse.text()).slice(0, 500);
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

  const created = await createResponse.json() as GitHubUpstreamPR;
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
