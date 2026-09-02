import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from 'cloudflare:workers';
import { NonRetryableError } from 'cloudflare:workflows';
import type { Env, ShadowSyncParams } from './types.js';
import {
  META_REPOS,
  ORG,
  isAutomatedAccount,
  isValidatorBot,
  parseDecision,
  parseDetectionTool,
  parseDuplicateParent,
  parseGitHubUrl,
  reactionPolarity,
  type GitHubComment,
  type GitHubPR,
  type GitHubReaction,
  type GitHubRepo,
} from './github.js';
import {
  finishSyncJob,
  getOrStartSyncJob,
  incrementSyncJobProgress,
  markSyncJobRunning,
  recordDailyBudget,
  recordSyncJobEvent,
  resumeSyncJob,
  startSyncJob,
} from './syncJobs.js';

const WORKFLOW_STEP_LIMIT = 2_000;
const INSTANCE_EXTERNAL_REQUEST_LIMIT = 40;
const WORKFLOW_RETRY_LIMIT = 3;

class ShadowGitHubRequestError extends Error {
  constructor(readonly status: number) {
    super(`GitHub shadow request failed with HTTP ${status}`);
    this.name = 'ShadowGitHubRequestError';
  }
}

interface GitHubRequestBudget {
  requests: number;
  limit: number | null;
  remaining: number | null;
  resetAt: string | null;
}

interface ShadowWorkItem {
  id: string;
  job_run_id: string;
  entity_id: string;
  payload_json: string;
  attempts: number;
}

interface ShadowRepoTask {
  id: number;
  name: string;
}

interface ShadowPRTask {
  repo_id: number;
  repo_name: string;
  upstream_url: string | null;
  pr: GitHubPR;
}

interface ShadowParticipant {
  interactions: number;
  non_oasis_interactions: number;
  decision: 'accept' | 'modify' | 'reject' | 'duplicate' | null;
  reactions_received: number;
}

interface ShadowComment {
  id: number;
  pr_id: number;
  repo_name: string;
  pr_number: number;
  login: string;
  decision: 'accept' | 'modify' | 'reject' | 'duplicate';
  duplicate_of: number | null;
  created_at: string;
  pr_created_at: string;
}

interface ShadowReaction {
  comment_id: number;
  reactor: string;
  content: string;
  is_positive: number;
}

interface CollectedShadowPR {
  pullRequest: Record<string, unknown>;
  comments: ShadowComment[];
  reactions: ShadowReaction[];
  participants: Array<Record<string, unknown>>;
  githubRequests: number;
}

function isoNow(): string {
  return new Date().toISOString();
}

function createBudget(): GitHubRequestBudget {
  return { requests: 0, limit: null, remaining: null, resetAt: null };
}

function updateRateBudget(response: Response, budget: GitHubRequestBudget): void {
  budget.requests += 1;
  const limitHeader = response.headers.get('x-ratelimit-limit');
  const remainingHeader = response.headers.get('x-ratelimit-remaining');
  const resetHeader = response.headers.get('x-ratelimit-reset');
  const limit = limitHeader === null ? Number.NaN : Number(limitHeader);
  const remaining = remainingHeader === null ? Number.NaN : Number(remainingHeader);
  const reset = resetHeader === null ? Number.NaN : Number(resetHeader);
  if (Number.isFinite(limit)) budget.limit = limit;
  if (Number.isFinite(remaining)) budget.remaining = remaining;
  if (Number.isFinite(reset) && reset > 0) budget.resetAt = new Date(reset * 1000).toISOString();
  if (budget.requests > INSTANCE_EXTERNAL_REQUEST_LIMIT) {
    throw new Error(`Shadow Workflow external request guard exceeded ${INSTANCE_EXTERNAL_REQUEST_LIMIT}`);
  }
}

async function shadowGitHubFetch<T>(path: string, token: string, budget: GitHubRequestBudget): Promise<T> {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'oasis-shadow-sync/1.0',
    },
  });
  updateRateBudget(response, budget);
  if (!response.ok) throw new ShadowGitHubRequestError(response.status);
  return response.json() as Promise<T>;
}

async function shadowGitHubFetchAll<T>(path: string, token: string, budget: GitHubRequestBudget): Promise<T[]> {
  const result: T[] = [];
  for (let page = 1; ; page++) {
    const separator = path.includes('?') ? '&' : '?';
    const values = await shadowGitHubFetch<T[]>(`${path}${separator}per_page=100&page=${page}`, token, budget);
    if (!Array.isArray(values) || values.length === 0) break;
    result.push(...values);
    if (values.length < 100) break;
  }
  return result;
}

async function fingerprint(payload: Record<string, unknown>): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('');
}

async function putShadowEntity(
  db: D1Database,
  pipelineRunId: string,
  entityType: string,
  entityId: string | number,
  payload: Record<string, unknown>,
  repositoryId: number | null,
  sourceUpdatedAt: string | null,
): Promise<void> {
  await db.prepare(`
    INSERT OR REPLACE INTO sync_shadow_entities (
      pipeline_run_id, entity_type, entity_id, repository_id,
      source_updated_at, fingerprint, payload_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    pipelineRunId,
    entityType,
    String(entityId),
    repositoryId,
    sourceUpdatedAt,
    await fingerprint(payload),
    JSON.stringify(payload),
    isoNow(),
  ).run();
}

async function jobRunId(db: D1Database, pipelineRunId: string, key: string): Promise<string> {
  const row = await db.prepare(
    'SELECT id FROM sync_job_runs WHERE pipeline_run_id = ? AND job_key = ? ORDER BY created_at DESC LIMIT 1',
  ).bind(pipelineRunId, key).first<{ id: string }>();
  if (!row) throw new Error(`Missing shadow job run: ${key}`);
  return row.id;
}

async function seedWorkItem(
  db: D1Database,
  pipelineRunId: string,
  runId: string,
  jobKey: string,
  entityType: string,
  entityId: string | number,
  payload: Record<string, unknown>,
): Promise<void> {
  const now = isoNow();
  await db.prepare(`
    INSERT OR IGNORE INTO sync_work_items (
      id, pipeline_run_id, job_run_id, job_key, entity_type, entity_id,
      payload_json, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
  `).bind(
    crypto.randomUUID(), pipelineRunId, runId, jobKey, entityType,
    String(entityId), JSON.stringify(payload), now, now,
  ).run();
}

async function claimNextWorkItem(
  db: D1Database,
  pipelineRunId: string,
  jobKey: string,
): Promise<ShadowWorkItem | null> {
  const row = await db.prepare(`
    SELECT id, job_run_id, entity_id, payload_json, attempts
      FROM sync_work_items
     WHERE pipeline_run_id = ? AND job_key = ? AND status IN ('pending', 'deferred')
     ORDER BY created_at, id LIMIT 1
  `).bind(pipelineRunId, jobKey).first<ShadowWorkItem>();
  if (!row) return null;
  const now = isoNow();
  const result = await db.prepare(`
    UPDATE sync_work_items
       SET status = 'leased', attempts = attempts + 1, leased_at = ?,
           lease_expires_at = ?, updated_at = ?
     WHERE id = ? AND status IN ('pending', 'deferred')
  `).bind(now, new Date(Date.now() + 30 * 60_000).toISOString(), now, row.id).run();
  return (result.meta.changes ?? 0) === 1 ? row : null;
}

async function completeWorkItem(db: D1Database, id: string): Promise<void> {
  await db.prepare(`
    UPDATE sync_work_items
       SET status = 'succeeded', leased_at = NULL, lease_expires_at = NULL, updated_at = ?
     WHERE id = ?
  `).bind(isoNow(), id).run();
}

async function failWorkItem(db: D1Database, id: string, error: unknown): Promise<void> {
  const summary = error instanceof Error ? error.message.slice(0, 500) : 'Shadow work item failed';
  await db.prepare(`
    UPDATE sync_work_items
       SET status = 'failed', leased_at = NULL, lease_expires_at = NULL,
           last_error_code = 'shadow_item_failed', last_error_summary = ?, updated_at = ?
     WHERE id = ?
  `).bind(summary, isoNow(), id).run();
}

async function observeBudgets(db: D1Database, budget: GitHubRequestBudget): Promise<void> {
  await Promise.all([
    recordDailyBudget(db, {
      key: 'workflow_steps',
      label: 'OASIS Workflow steps',
      unit: 'steps',
      limit: WORKFLOW_STEP_LIMIT,
      consumedDelta: 1,
    }),
    recordDailyBudget(db, {
      key: 'github_rest',
      label: 'GitHub REST API',
      unit: 'requests',
      limit: budget.limit,
      consumedDelta: budget.requests,
      remaining: budget.remaining,
      resetAt: budget.resetAt,
    }),
    recordDailyBudget(db, {
      key: 'workflow_external_requests',
      label: 'Workflow external requests (daily observed)',
      unit: 'requests',
      limit: null,
      consumedDelta: budget.requests,
    }),
    recordDailyBudget(db, {
      key: 'workflow_external_request_limit',
      label: 'Peak Workflow instance requests',
      unit: 'requests per instance',
      limit: 50,
      consumedMaximum: budget.requests,
      remaining: Math.max(0, 50 - budget.requests),
    }),
  ]);
}

async function collectShadowPR(
  env: Env,
  task: ShadowPRTask,
  budget: GitHubRequestBudget,
): Promise<CollectedShadowPR> {
  const { pr } = task;
  const comments = await shadowGitHubFetchAll<GitHubComment>(
    `/repos/${ORG}/${task.repo_name}/issues/${pr.number}/comments`, env.GITHUB_TOKEN, budget,
  );
  const participants = new Map<string, ShadowParticipant>();
  const ensureParticipant = (login: string): ShadowParticipant => {
    const existing = participants.get(login);
    if (existing) return existing;
    const created: ShadowParticipant = {
      interactions: 0,
      non_oasis_interactions: 0,
      decision: null,
      reactions_received: 0,
    };
    participants.set(login, created);
    return created;
  };

  let oasisComments = 0;
  let nonOasisComments = 0;
  let accept = 0;
  let modify = 0;
  let reject = 0;
  const commentEntities: ShadowComment[] = [];
  const reactionEntities: ShadowReaction[] = [];

  for (const comment of comments) {
    const login = comment.user?.login;
    const decision = parseDecision(comment.body);
    if (login && isValidatorBot(login) && decision) {
      oasisComments += 1;
      if (decision === 'accept') accept += 1;
      if (decision === 'modify') modify += 1;
      if (decision === 'reject') reject += 1;
      commentEntities.push({
        id: comment.id, pr_id: pr.id, repo_name: task.repo_name, pr_number: pr.number,
        login, decision, duplicate_of: decision === 'duplicate' ? parseDuplicateParent(comment.body) : null,
        created_at: comment.created_at, pr_created_at: pr.created_at,
      });
      const reactions = await shadowGitHubFetchAll<GitHubReaction>(
        `/repos/${ORG}/${task.repo_name}/issues/comments/${comment.id}/reactions`, env.GITHUB_TOKEN, budget,
      );
      for (const reaction of reactions) {
        const reactor = reaction.user?.login;
        if (!reactor || reactor === login || isAutomatedAccount(reactor)) continue;
        if (reaction.content === '+1') {
          if (decision === 'accept') accept += 1;
          if (decision === 'modify') modify += 1;
          if (decision === 'reject') reject += 1;
        }
        reactionEntities.push({
          comment_id: comment.id,
          reactor,
          content: reaction.content,
          is_positive: reactionPolarity(reaction.content) === 'positive' ? 1 : 0,
        });
      }
      continue;
    }

    if (!login || isAutomatedAccount(login)) continue;
    const participant = ensureParticipant(login);
    if (!decision) {
      participant.non_oasis_interactions += 1;
      nonOasisComments += 1;
      continue;
    }
    participant.interactions += 1;
    participant.decision = decision;
    oasisComments += 1;
    if (decision === 'accept') accept += 1;
    if (decision === 'modify') modify += 1;
    if (decision === 'reject') reject += 1;
    commentEntities.push({
      id: comment.id, pr_id: pr.id, repo_name: task.repo_name, pr_number: pr.number,
      login, decision, duplicate_of: decision === 'duplicate' ? parseDuplicateParent(comment.body) : null,
      created_at: comment.created_at, pr_created_at: pr.created_at,
    });
    const reactions = await shadowGitHubFetchAll<GitHubReaction>(
      `/repos/${ORG}/${task.repo_name}/issues/comments/${comment.id}/reactions`, env.GITHUB_TOKEN, budget,
    );
    for (const reaction of reactions) {
      const reactor = reaction.user?.login;
      if (!reactor || reactor === login || isAutomatedAccount(reactor)) continue;
      participant.reactions_received += 1;
      if (reaction.content === '+1') {
        if (decision === 'accept') accept += 1;
        if (decision === 'modify') modify += 1;
        if (decision === 'reject') reject += 1;
      }
      reactionEntities.push({
        comment_id: comment.id,
        reactor,
        content: reaction.content,
        is_positive: reactionPolarity(reaction.content) === 'positive' ? 1 : 0,
      });
    }
  }

  const canonical = await env.DB.prepare(`
    SELECT duplicate_of, closed_as_duplicate, merged_upstream
      FROM pull_requests WHERE id = ?
  `).bind(pr.id).first<{ duplicate_of: number | null; closed_as_duplicate: number; merged_upstream: number }>();
  let mergedUpstream = canonical?.merged_upstream ?? 0;
  if (mergedUpstream === 0 && pr.merged_at && pr.head?.sha && task.upstream_url) {
    const upstream = parseGitHubUrl(task.upstream_url);
    if (upstream) {
      const response = await fetch(
        `https://api.github.com/repos/${upstream.owner}/${upstream.repo}/commits/${pr.head.sha}`,
        { headers: { Authorization: `Bearer ${env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json', 'User-Agent': 'oasis-shadow-sync/1.0' } },
      );
      updateRateBudget(response, budget);
      if (response.body) await response.body.cancel();
      if (response.status === 200) mergedUpstream = 1;
    }
  }

  const participantEntities = Array.from(participants.entries()).map(([login, participant]) => ({
    pr_id: pr.id,
    repo_name: task.repo_name,
    pr_number: pr.number,
    login,
    interactions: participant.interactions,
    non_oasis_interactions: participant.non_oasis_interactions,
    decision: participant.decision,
    reactions_received: participant.reactions_received,
  }));

  return {
    pullRequest: {
      id: pr.id,
      repo_id: task.repo_id,
      repo_name: task.repo_name,
      number: pr.number,
      title: pr.title,
      state: pr.state === 'open' ? 'open' : 'closed',
      author: pr.user?.login ?? null,
      html_url: pr.html_url,
      comment_count: comments.length,
      oasis_comment_count: oasisComments,
      non_oasis_comment_count: nonOasisComments,
      participants: participantEntities.filter(item => item.decision !== null).length,
      consensus_accept: accept,
      consensus_modify: modify,
      consensus_reject: reject,
      // The canonical writer currently preserves this field through the
      // duplicate projection rather than the PR ingestion call.
      consensus_duplicate: 0,
      duplicate_of: canonical?.duplicate_of ?? null,
      closed_as_duplicate: canonical?.closed_as_duplicate ?? 0,
      merged_upstream: mergedUpstream,
      head_sha: pr.head?.sha ?? null,
      merged_at: pr.merged_at ?? null,
      created_at: pr.created_at,
      updated_at: pr.updated_at,
      detection_tool: parseDetectionTool(pr.body),
      deleted: 0,
    },
    comments: commentEntities,
    reactions: reactionEntities,
    participants: participantEntities,
    githubRequests: budget.requests,
  };
}

export function shadowPipelineRunId(legacyPipelineRunId: string): string {
  return `shadow-${legacyPipelineRunId}`;
}

export function shadowWorkflowInstanceId(legacyPipelineRunId: string): string {
  return `shadow-start-${legacyPipelineRunId}`.slice(0, 100);
}

export function nonRetryableShadowError(message: string): NonRetryableError {
  // Workflows recognizes this error by its runtime-provided identity. Keep the
  // default name instead of replacing it with the upstream error's name.
  return new NonRetryableError(message);
}

const SHADOW_PIPELINE_JOB_KEYS = [
  'pull_request_catalog',
  'upstream_merge_status',
  'pull_request_comments',
  'comment_reactions',
  'vote_projection',
  'duplicate_resolution',
  'contributor_scores',
  'orphan_cleanup',
] as const;

async function skipBlockedShadowJobs(db: D1Database, pipelineRunId: string, error: unknown): Promise<void> {
  for (const jobKey of SHADOW_PIPELINE_JOB_KEYS) {
    const id = await jobRunId(db, pipelineRunId, jobKey);
    await finishSyncJob(db, id, 'skipped', {
      errorCode: 'blocked_by_inventory_failure',
      error,
    });
  }
}

async function processInventory(
  env: Env,
  event: WorkflowEvent<ShadowSyncParams>,
  attempt: number,
): Promise<Record<string, number>> {
  const params = event.payload;
  if (params.action !== 'start') throw new Error('Inventory requires a start payload');
  const runId = shadowPipelineRunId(params.legacyPipelineRunId);
  const cutoff = params.canonicalCutoffAt;
  await env.DB.prepare(`
    INSERT OR IGNORE INTO sync_parity_runs (
      pipeline_run_id, canonical_pipeline_run_id, canonical_cutoff_at, status, created_at
    ) VALUES (?, ?, ?, 'pending', ?)
  `).bind(runId, params.legacyPipelineRunId, cutoff, isoNow()).run();
  await env.DB.prepare(`
    UPDATE sync_parity_runs
       SET status = 'pending', compared_at = NULL
     WHERE pipeline_run_id = ?
  `).bind(runId).run();

  const inventoryRunId = await getOrStartSyncJob(env.DB, {
    jobKey: 'repository_inventory', pipelineRunId: runId, workflowInstanceId: event.instanceId,
    trigger: 'scheduled', mode: 'shadow',
  });
  await resumeSyncJob(env.DB, inventoryRunId);
  const catalogRunId = await getOrStartSyncJob(env.DB, {
    jobKey: 'pull_request_catalog', pipelineRunId: runId, trigger: 'continuation', mode: 'shadow', status: 'queued',
  });
  for (const key of SHADOW_PIPELINE_JOB_KEYS.slice(1)) {
    await getOrStartSyncJob(env.DB, {
      jobKey: key, pipelineRunId: runId, trigger: 'continuation', mode: 'shadow', status: 'queued',
    });
  }
  await env.DB.prepare(`
    UPDATE sync_job_runs
       SET status = 'queued', finished_at = NULL, duration_ms = NULL,
           error_code = NULL, error_summary = NULL
     WHERE pipeline_run_id = ? AND mode = 'shadow' AND job_key <> 'repository_inventory'
       AND status IN ('skipped', 'deferred', 'interrupted')
  `).bind(runId).run();

  const budget = createBudget();
  try {
    const allRepos = await shadowGitHubFetchAll<GitHubRepo>(`/orgs/${ORG}/repos?type=public`, env.GITHUB_TOKEN, budget);
    const repos = allRepos.filter(repo => repo.fork && !META_REPOS.has(repo.name));
    for (const repo of repos) {
      const payload = {
        id: repo.id,
        name: repo.name,
        full_name: repo.full_name,
        description: repo.description ?? null,
        language: repo.language ?? null,
        stars: repo.stargazers_count,
        upstream_url: null,
        active: 1,
      };
      await putShadowEntity(env.DB, runId, 'repository', repo.id, payload, repo.id, null);
      await seedWorkItem(env.DB, runId, catalogRunId, 'pull_request_catalog', 'repository', repo.id, { id: repo.id, name: repo.name });
    }
    await markSyncJobRunning(env.DB, catalogRunId, repos.length);
    await finishSyncJob(env.DB, inventoryRunId, 'succeeded', {
      metrics: { repositories: repos.length, github_requests: budget.requests, attempts: attempt },
      completedItems: repos.length,
    });
    await observeBudgets(env.DB, budget);
    await continueShadow(env, { action: 'repository', pipelineRunId: runId }, 'repo-0');
    return { repositories: repos.length, github_requests: budget.requests };
  } catch (error) {
    const terminal = error instanceof ShadowGitHubRequestError && (error.status === 401 || error.status === 403);
    const finalAttempt = terminal || attempt > WORKFLOW_RETRY_LIMIT;
    await finishSyncJob(env.DB, inventoryRunId, 'failed', {
      metrics: { github_requests: budget.requests, attempts: attempt },
      failedItems: 1,
      errorCode: terminal ? 'github_authentication_failed' : 'shadow_inventory_failed',
      error,
    });
    await recordSyncJobEvent(env.DB, inventoryRunId, {
      type: 'repository_inventory_failed',
      attempt,
      responseStatus: error instanceof ShadowGitHubRequestError ? error.status : null,
      message: error instanceof Error ? error.message : 'Shadow repository inventory failed',
      details: { final_attempt: finalAttempt, github_requests: budget.requests },
    });
    await observeBudgets(env.DB, budget);
    if (finalAttempt) {
      await skipBlockedShadowJobs(env.DB, runId, error);
      await env.DB.prepare(`
        UPDATE sync_parity_runs SET status = 'incomplete', compared_at = ?
         WHERE pipeline_run_id = ?
      `).bind(isoNow(), runId).run();
    }
    if (terminal) throw nonRetryableShadowError(error.message);
    throw error;
  }
}

async function processRepository(env: Env, params: Extract<ShadowSyncParams, { action: 'repository' }>): Promise<Record<string, number>> {
  const item = await claimNextWorkItem(env.DB, params.pipelineRunId, 'pull_request_catalog');
  if (!item) {
    const catalogId = await jobRunId(env.DB, params.pipelineRunId, 'pull_request_catalog');
    const progress = await env.DB.prepare('SELECT completed_items, failed_items FROM sync_job_runs WHERE id = ?')
      .bind(catalogId).first<{ completed_items: number; failed_items: number }>();
    await finishSyncJob(env.DB, catalogId, (progress?.failed_items ?? 0) > 0 ? 'failed' : 'succeeded', {
      metrics: { repositories: progress?.completed_items ?? 0 },
      completedItems: progress?.completed_items ?? 0,
      failedItems: progress?.failed_items ?? 0,
    });
    const prCount = await env.DB.prepare(`
      SELECT COUNT(*) AS count FROM sync_work_items
       WHERE pipeline_run_id = ? AND job_key = 'pull_request_comments'
    `).bind(params.pipelineRunId).first<{ count: number }>();
    for (const key of ['upstream_merge_status', 'pull_request_comments', 'comment_reactions']) {
      await markSyncJobRunning(env.DB, await jobRunId(env.DB, params.pipelineRunId, key), prCount?.count ?? 0);
    }
    await continueShadow(env, { action: 'pull_request', pipelineRunId: params.pipelineRunId }, 'pr-0');
    return { repositories: progress?.completed_items ?? 0 };
  }

  const task = JSON.parse(item.payload_json) as ShadowRepoTask;
  const budget = createBudget();
  try {
    const detail = await shadowGitHubFetch<GitHubRepo>(`/repos/${ORG}/${task.name}`, env.GITHUB_TOKEN, budget);
    const upstreamUrl = detail.parent?.html_url ?? null;
    const open = await shadowGitHubFetchAll<GitHubPR>(`/repos/${ORG}/${task.name}/pulls?state=open&sort=updated&direction=desc`, env.GITHUB_TOKEN, budget);
    const closed = await shadowGitHubFetchAll<GitHubPR>(`/repos/${ORG}/${task.name}/pulls?state=closed&sort=updated&direction=desc`, env.GITHUB_TOKEN, budget);
    await putShadowEntity(env.DB, params.pipelineRunId, 'repository', task.id, {
      id: detail.id, name: detail.name, full_name: detail.full_name,
      description: detail.description ?? null, language: detail.language ?? null,
      stars: detail.stargazers_count, upstream_url: upstreamUrl, active: 1,
    }, task.id, null);
    const commentJobId = await jobRunId(env.DB, params.pipelineRunId, 'pull_request_comments');
    for (const pr of [...open, ...closed]) {
      await seedWorkItem(env.DB, params.pipelineRunId, commentJobId, 'pull_request_comments', 'pull_request', pr.id, {
        repo_id: task.id, repo_name: task.name, upstream_url: upstreamUrl, pr,
      });
    }
    await completeWorkItem(env.DB, item.id);
    await incrementSyncJobProgress(env.DB, item.job_run_id, 1);
    await recordSyncJobEvent(env.DB, item.job_run_id, {
      type: 'repository_catalogued', entityType: 'repository', entityId: task.id,
      details: { pull_requests: open.length + closed.length, github_requests: budget.requests },
    });
  } catch (error) {
    await failWorkItem(env.DB, item.id, error);
    await incrementSyncJobProgress(env.DB, item.job_run_id, 0, 1);
    await recordSyncJobEvent(env.DB, item.job_run_id, { type: 'repository_failed', entityType: 'repository', entityId: task.id, message: error instanceof Error ? error.message : 'Repository failed' });
  }
  await observeBudgets(env.DB, budget);
  await continueShadow(env, { action: 'repository', pipelineRunId: params.pipelineRunId }, `repo-after-${task.id}`);
  return { github_requests: budget.requests };
}

async function processPullRequest(env: Env, params: Extract<ShadowSyncParams, { action: 'pull_request' }>): Promise<Record<string, number>> {
  const item = await claimNextWorkItem(env.DB, params.pipelineRunId, 'pull_request_comments');
  if (!item) {
    for (const key of ['upstream_merge_status', 'pull_request_comments', 'comment_reactions']) {
      const id = await jobRunId(env.DB, params.pipelineRunId, key);
      const progress = await env.DB.prepare('SELECT completed_items, failed_items FROM sync_job_runs WHERE id = ?')
        .bind(id).first<{ completed_items: number; failed_items: number }>();
      await finishSyncJob(env.DB, id, (progress?.failed_items ?? 0) > 0 ? 'failed' : 'succeeded', {
        metrics: { pull_requests: progress?.completed_items ?? 0 },
        completedItems: progress?.completed_items ?? 0,
        failedItems: progress?.failed_items ?? 0,
      });
    }
    await continueShadow(env, { action: 'finalize', pipelineRunId: params.pipelineRunId }, 'finalize');
    return { pull_requests: 0 };
  }

  const task = JSON.parse(item.payload_json) as ShadowPRTask;
  const budget = createBudget();
  try {
    const collected = await collectShadowPR(env, task, budget);
    await putShadowEntity(env.DB, params.pipelineRunId, 'pull_request', task.pr.id, collected.pullRequest, task.repo_id, task.pr.updated_at);
    for (const comment of collected.comments) {
      await putShadowEntity(env.DB, params.pipelineRunId, 'comment', comment.id, comment as unknown as Record<string, unknown>, task.repo_id, comment.created_at);
    }
    for (const reaction of collected.reactions) {
      await putShadowEntity(env.DB, params.pipelineRunId, 'reaction', `${reaction.comment_id}:${reaction.reactor}:${reaction.content}`, reaction as unknown as Record<string, unknown>, task.repo_id, null);
    }
    for (const participant of collected.participants) {
      await putShadowEntity(env.DB, params.pipelineRunId, 'participant', `${task.pr.id}:${String(participant['login'])}`, participant, task.repo_id, task.pr.updated_at);
    }
    await completeWorkItem(env.DB, item.id);
    for (const key of ['upstream_merge_status', 'pull_request_comments', 'comment_reactions']) {
      await incrementSyncJobProgress(env.DB, await jobRunId(env.DB, params.pipelineRunId, key), 1);
    }
    await recordSyncJobEvent(env.DB, item.job_run_id, {
      type: 'pull_request_collected', entityType: 'pull_request', entityId: task.pr.id,
      details: { comments: collected.comments.length, reactions: collected.reactions.length, github_requests: budget.requests },
    });
  } catch (error) {
    await failWorkItem(env.DB, item.id, error);
    for (const key of ['upstream_merge_status', 'pull_request_comments', 'comment_reactions']) {
      await incrementSyncJobProgress(env.DB, await jobRunId(env.DB, params.pipelineRunId, key), 0, 1);
    }
    await recordSyncJobEvent(env.DB, item.job_run_id, { type: 'pull_request_failed', entityType: 'pull_request', entityId: task.pr.id, message: error instanceof Error ? error.message : 'Pull request failed' });
  }
  await observeBudgets(env.DB, budget);
  await continueShadow(env, { action: 'pull_request', pipelineRunId: params.pipelineRunId }, `pr-after-${task.pr.id}`);
  return { github_requests: budget.requests };
}

async function projectShadowVotes(env: Env, pipelineRunId: string): Promise<number> {
  const rows = await env.DB.prepare(`
    SELECT payload_json FROM sync_shadow_entities
     WHERE pipeline_run_id = ? AND entity_type = 'comment'
  `).bind(pipelineRunId).all<{ payload_json: string }>();
  let projected = 0;
  for (const row of rows.results ?? []) {
    const comment = JSON.parse(row.payload_json) as ShadowComment;
    if (isValidatorBot(comment.login)) continue;
    const prRow = await env.DB.prepare(`
      SELECT payload_json FROM sync_shadow_entities
       WHERE pipeline_run_id = ? AND entity_type = 'pull_request' AND entity_id = ?
    `).bind(pipelineRunId, String(comment.pr_id)).first<{ payload_json: string }>();
    if (!prRow) continue;
    const pr = JSON.parse(prRow.payload_json) as Record<string, unknown>;
    let parentPrId: number | null = null;
    if (comment.decision === 'duplicate' && comment.duplicate_of) {
      const candidates = await env.DB.prepare(`
        SELECT payload_json FROM sync_shadow_entities
         WHERE pipeline_run_id = ? AND entity_type = 'pull_request' AND repository_id = ?
      `).bind(pipelineRunId, Number(pr['repo_id'])).all<{ payload_json: string }>();
      const parent = (candidates.results ?? [])
        .map(candidate => JSON.parse(candidate.payload_json) as Record<string, unknown>)
        .find(candidate => Number(candidate['number']) === comment.duplicate_of);
      parentPrId = parent ? Number(parent['id']) : null;
    }
    await putShadowEntity(env.DB, pipelineRunId, 'vote', `${comment.login}:${comment.pr_id}`, {
      github_login: comment.login,
      pr_id: comment.pr_id,
      repo_name: comment.repo_name,
      pr_number: comment.pr_number,
      decision: comment.decision,
      parent_pr_id: parentPrId,
      comment_id: comment.id,
      voted_at: comment.created_at,
    }, Number(pr['repo_id']), comment.created_at);
    projected += 1;
  }
  return projected;
}

async function rebuildShadowDuplicates(env: Env, pipelineRunId: string): Promise<number> {
  const votes = await env.DB.prepare(`
    SELECT payload_json FROM sync_shadow_entities
     WHERE pipeline_run_id = ? AND entity_type = 'vote'
  `).bind(pipelineRunId).all<{ payload_json: string }>();
  const duplicatePrIds = new Set<number>();
  for (const row of votes.results ?? []) {
    const vote = JSON.parse(row.payload_json) as Record<string, unknown>;
    if (vote['decision'] === 'duplicate') duplicatePrIds.add(Number(vote['pr_id']));
  }
  let simulatedActions = 0;
  for (const prId of duplicatePrIds) {
    const entity = await env.DB.prepare(`
      SELECT repository_id, source_updated_at, payload_json
        FROM sync_shadow_entities
       WHERE pipeline_run_id = ? AND entity_type = 'pull_request' AND entity_id = ?
    `).bind(pipelineRunId, String(prId)).first<{
      repository_id: number | null;
      source_updated_at: string | null;
      payload_json: string;
    }>();
    if (!entity) continue;
    const pr = JSON.parse(entity.payload_json) as Record<string, unknown>;
    const duplicateCount = Number(pr['consensus_duplicate'] ?? 0);
    const competing = Math.max(
      Number(pr['consensus_accept'] ?? 0),
      Number(pr['consensus_modify'] ?? 0),
      Number(pr['consensus_reject'] ?? 0),
    );
    if (duplicateCount <= competing) {
      pr['duplicate_of'] = null;
    } else {
      // This branch mirrors the canonical intent without performing its GitHub
      // mutations. It becomes relevant once consensus_duplicate is persisted.
      const candidates = (votes.results ?? [])
        .map(row => JSON.parse(row.payload_json) as Record<string, unknown>)
        .filter(vote => Number(vote['pr_id']) === prId && vote['decision'] === 'duplicate' && vote['parent_pr_id'] !== null);
      const counts = new Map<number, number>();
      for (const candidate of candidates) {
        const parentId = Number(candidate['parent_pr_id']);
        counts.set(parentId, (counts.get(parentId) ?? 0) + 1);
      }
      const winner = Array.from(counts.entries()).sort((left, right) => right[1] - left[1])[0]?.[0] ?? null;
      pr['duplicate_of'] = winner;
      if (winner !== null && pr['state'] === 'open') simulatedActions += 1;
    }
    await putShadowEntity(env.DB, pipelineRunId, 'pull_request', prId, pr, entity.repository_id, entity.source_updated_at);
  }
  return simulatedActions;
}

interface ShadowContributorComment extends ShadowComment {
  total_reactions: number;
  positive_reactions: number;
  negative_reactions: number;
}

interface ShadowScore {
  comment_score: number;
  peer_score: number;
  reaction_score: number;
  trust_score: number;
}

interface ShadowBonus {
  early_mover: number;
  early_bird: number;
  influencer: number;
}

function contributorCalculations(
  comments: ShadowContributorComment[],
  reactions: ShadowReaction[],
  participants: Array<Record<string, unknown>>,
  pullRequests: Map<number, Record<string, unknown>>,
  since: string | null,
): { scores: Map<string, ShadowScore>; bonuses: Map<string, ShadowBonus> } {
  const cutoff = since ?? '1970-01-01T00:00:00.000Z';
  const selectedComments = comments.filter(comment => comment.created_at >= cutoff);
  const selectedIds = new Set(selectedComments.map(comment => comment.id));
  const scores = new Map<string, ShadowScore>();
  const bonuses = new Map<string, ShadowBonus>();
  const score = (login: string): ShadowScore => {
    const existing = scores.get(login);
    if (existing) return existing;
    const created = { comment_score: 0, peer_score: 0, reaction_score: 0, trust_score: 0 };
    scores.set(login, created);
    return created;
  };
  const bonus = (login: string): ShadowBonus => {
    const existing = bonuses.get(login);
    if (existing) return existing;
    const created = { early_mover: 0, early_bird: 0, influencer: 0 };
    bonuses.set(login, created);
    return created;
  };

  for (const comment of selectedComments) score(comment.login).comment_score += 1;
  const reactionsGiven = new Map<string, number>();
  const commentById = new Map(comments.map(comment => [comment.id, comment]));
  for (const reaction of reactions) {
    if (!selectedIds.has(reaction.comment_id)) continue;
    const comment = commentById.get(reaction.comment_id);
    if (!comment) continue;
    score(comment.login).peer_score += 0.25 + (reaction.is_positive === 1 ? 0.10 : -0.50);
    if (reaction.reactor !== comment.login) {
      reactionsGiven.set(reaction.reactor, (reactionsGiven.get(reaction.reactor) ?? 0) + 1);
    }
  }
  for (const [login, count] of reactionsGiven) score(login).reaction_score = Math.min(count, 5) * 0.25;

  for (const participant of participants) {
    if (participant['decision'] !== 'accept') continue;
    const prId = Number(participant['pr_id']);
    if (Number(pullRequests.get(prId)?.['merged_upstream'] ?? 0) !== 1) continue;
    const matchingComments = selectedComments.filter(comment => comment.pr_id === prId && comment.login === participant['login']).length;
    if (matchingComments > 0) score(String(participant['login'])).trust_score += matchingComments * 10;
  }

  const byPr = new Map<number, ShadowContributorComment[]>();
  for (const comment of selectedComments.sort((left, right) => left.created_at.localeCompare(right.created_at))) {
    const group = byPr.get(comment.pr_id) ?? [];
    group.push(comment);
    byPr.set(comment.pr_id, group);
  }
  const now = Date.now();
  for (const group of byPr.values()) {
    if (group.length === 0) continue;
    const prCreated = Date.parse(group[0].pr_created_at);
    const applyEarlyMover = (now - prCreated) / 3_600_000 > 72;
    const count = group.length;
    const firstBucket = Math.max(1, Math.floor(count * 0.01));
    const secondBucket = firstBucket + Math.floor(count * 0.09);
    const thirdBucket = secondBucket + Math.floor(count * 0.15);
    const topTotal = [...group].sort((left, right) => right.total_reactions - left.total_reactions || left.created_at.localeCompare(right.created_at))[0];
    const topPositive = [...group].sort((left, right) => right.positive_reactions - left.positive_reactions || left.created_at.localeCompare(right.created_at))[0];
    const topNegative = [...group].sort((left, right) => right.negative_reactions - left.negative_reactions || left.created_at.localeCompare(right.created_at))[0];
    group.forEach((comment, index) => {
      const value = bonus(comment.login);
      const rank = index + 1;
      if (applyEarlyMover) {
        if (rank <= firstBucket) value.early_mover += 0.20;
        else if (rank <= secondBucket) value.early_mover += 0.10;
        else if (rank <= thirdBucket) value.early_mover += 0.05;
      }
      const hoursAfter = (Date.parse(comment.created_at) - prCreated) / 3_600_000;
      if (hoursAfter <= 24) value.early_bird += 0.25;
      else if (hoursAfter <= 96) value.early_bird += 0.10;
      if (comment.id === topTotal.id && topTotal.total_reactions > 0) value.influencer += 0.10;
      if (comment.id === topPositive.id && topPositive.positive_reactions > 0) value.influencer += 0.20;
      if (comment.id === topNegative.id && topNegative.negative_reactions > 0) value.influencer -= 0.50;
    });
  }
  return { scores, bonuses };
}

async function rebuildShadowContributors(env: Env, pipelineRunId: string): Promise<number> {
  const entities = await env.DB.prepare(`
    SELECT entity_type, payload_json FROM sync_shadow_entities
     WHERE pipeline_run_id = ? AND entity_type IN ('comment', 'reaction', 'participant', 'pull_request')
  `).bind(pipelineRunId).all<{ entity_type: string; payload_json: string }>();
  const rawComments: ShadowComment[] = [];
  const reactions: ShadowReaction[] = [];
  const participants: Array<Record<string, unknown>> = [];
  const pullRequests = new Map<number, Record<string, unknown>>();
  for (const entity of entities.results ?? []) {
    const payload = JSON.parse(entity.payload_json) as Record<string, unknown>;
    if (entity.entity_type === 'comment') rawComments.push(payload as unknown as ShadowComment);
    if (entity.entity_type === 'reaction') reactions.push(payload as unknown as ShadowReaction);
    if (entity.entity_type === 'participant') participants.push(payload);
    if (entity.entity_type === 'pull_request') pullRequests.set(Number(payload['id']), payload);
  }
  const reactionSummary = new Map<number, { total: number; positive: number; negative: number }>();
  for (const reaction of reactions) {
    const current = reactionSummary.get(reaction.comment_id) ?? { total: 0, positive: 0, negative: 0 };
    current.total += 1;
    if (reaction.is_positive === 1) current.positive += 1;
    else current.negative += 1;
    reactionSummary.set(reaction.comment_id, current);
  }
  const comments: ShadowContributorComment[] = rawComments.map(comment => {
    const summary = reactionSummary.get(comment.id) ?? { total: 0, positive: 0, negative: 0 };
    return { ...comment, total_reactions: summary.total, positive_reactions: summary.positive, negative_reactions: summary.negative };
  });
  const d90Cutoff = new Date(Date.now() - 90 * 86_400_000).toISOString();
  const allTime = contributorCalculations(comments, reactions, participants, pullRequests, null);
  const recent = contributorCalculations(comments, reactions, participants, pullRequests, d90Cutoff);
  const logins = new Set([...allTime.scores.keys(), ...recent.scores.keys()]);
  const calculated = Array.from(logins).map(login => {
    const baseParts = allTime.scores.get(login) ?? { comment_score: 0, peer_score: 0, reaction_score: 0, trust_score: 0 };
    const bonus = allTime.bonuses.get(login) ?? { early_mover: 0, early_bird: 0, influencer: 0 };
    const base = baseParts.comment_score + baseParts.peer_score + baseParts.reaction_score + baseParts.trust_score;
    const modified = base * (1 + bonus.early_mover + bonus.early_bird + bonus.influencer);
    const recentParts = recent.scores.get(login) ?? { comment_score: 0, peer_score: 0, reaction_score: 0, trust_score: 0 };
    const recentBonus = recent.bonuses.get(login) ?? { early_mover: 0, early_bird: 0, influencer: 0 };
    const recentBase = recentParts.comment_score + recentParts.peer_score + recentParts.reaction_score + recentParts.trust_score;
    const recentModified = recentBase * (1 + recentBonus.early_mover + recentBonus.early_bird + recentBonus.influencer);
    return { login, baseParts, base, modified, recentModified };
  });
  const ranked = calculated.filter(entry => entry.recentModified > 0).sort((left, right) => right.recentModified - left.recentModified);
  const rank = new Map(ranked.map((entry, index) => [entry.login, index + 1]));
  for (const entry of calculated) {
    const userParticipants = participants.filter(participant => participant['login'] === entry.login);
    const userReactionsGiven = reactions.filter(reaction => reaction.reactor === entry.login && comments.find(comment => comment.id === reaction.comment_id)?.login !== entry.login).length;
    const oldest = comments.filter(comment => comment.login === entry.login && comment.created_at >= d90Cutoff)
      .map(comment => comment.created_at).sort()[0] ?? null;
    const sourceUpdatedAt = [
      ...comments.filter(comment => comment.login === entry.login).map(comment => comment.created_at),
      ...userParticipants.map(participant => String(pullRequests.get(Number(participant['pr_id']))?.['updated_at'] ?? '')),
    ].filter(Boolean).sort().at(-1) ?? null;
    const canonical = await env.DB.prepare('SELECT avatar_url FROM contributors WHERE login = ?')
      .bind(entry.login).first<{ avatar_url: string | null }>();
    const payload = {
      login: entry.login,
      avatar_url: canonical?.avatar_url ?? `https://github.com/${entry.login}.png?size=64`,
      prs_worked: new Set(userParticipants.map(participant => Number(participant['pr_id']))).size,
      total_interactions: userParticipants.reduce((sum, participant) => sum + Number(participant['interactions'] ?? 0), 0),
      non_oasis_interactions: userParticipants.reduce((sum, participant) => sum + Number(participant['non_oasis_interactions'] ?? 0), 0),
      reactions_received: userParticipants.reduce((sum, participant) => sum + Number(participant['reactions_received'] ?? 0), 0),
      reactions_given: userReactionsGiven,
      accepts: userParticipants.filter(participant => participant['decision'] === 'accept').length,
      modifies: userParticipants.filter(participant => participant['decision'] === 'modify').length,
      rejects: userParticipants.filter(participant => participant['decision'] === 'reject').length,
      duplicates: userParticipants.filter(participant => participant['decision'] === 'duplicate').length,
      comment_score: Math.round(entry.baseParts.comment_score * 100) / 100,
      peer_score: Math.round(entry.baseParts.peer_score * 100) / 100,
      reaction_score: Math.round(entry.baseParts.reaction_score * 100) / 100,
      trust_score: Math.round(entry.baseParts.trust_score * 100) / 100,
      base_reputation: Math.round(entry.base * 100) / 100,
      modified_reputation: Math.round(entry.modified * 100) / 100,
      rank_90d: rank.get(entry.login) ?? null,
      rank_90d_oldest_activity: oldest,
    };
    await putShadowEntity(env.DB, pipelineRunId, 'contributor', entry.login, payload, null, sourceUpdatedAt);
  }
  return calculated.length;
}

function canonicalEntityQueries(): Array<{ entityType: string; sql: string }> {
  return [
    { entityType: 'repository', sql: `SELECT CAST(id AS TEXT) AS entity_id, NULL AS source_updated_at, json_object('id',id,'name',name,'full_name',full_name,'description',description,'language',language,'stars',stars,'upstream_url',upstream_url,'active',active) AS payload_json FROM repos WHERE active = 1` },
    { entityType: 'pull_request', sql: `SELECT CAST(id AS TEXT) AS entity_id, updated_at AS source_updated_at, json_object('id',id,'repo_id',repo_id,'repo_name',repo_name,'number',number,'title',title,'state',state,'author',author,'html_url',html_url,'comment_count',comment_count,'oasis_comment_count',oasis_comment_count,'non_oasis_comment_count',non_oasis_comment_count,'participants',participants,'consensus_accept',consensus_accept,'consensus_modify',consensus_modify,'consensus_reject',consensus_reject,'consensus_duplicate',consensus_duplicate,'duplicate_of',duplicate_of,'closed_as_duplicate',closed_as_duplicate,'merged_upstream',merged_upstream,'head_sha',head_sha,'merged_at',merged_at,'created_at',created_at,'updated_at',updated_at,'detection_tool',detection_tool,'deleted',deleted) AS payload_json FROM pull_requests WHERE deleted = 0` },
    { entityType: 'comment', sql: `SELECT CAST(id AS TEXT) AS entity_id, created_at AS source_updated_at, json_object('id',id,'pr_id',pr_id,'repo_name',repo_name,'pr_number',pr_number,'login',login,'decision',decision,'duplicate_of',duplicate_of,'created_at',created_at,'pr_created_at',pr_created_at) AS payload_json FROM pr_comments` },
    { entityType: 'reaction', sql: `SELECT CAST(comment_id AS TEXT)||':'||reactor||':'||content AS entity_id, NULL AS source_updated_at, json_object('comment_id',comment_id,'reactor',reactor,'content',content,'is_positive',is_positive) AS payload_json FROM comment_reactions` },
    { entityType: 'participant', sql: `SELECT CAST(pr_id AS TEXT)||':'||login AS entity_id, NULL AS source_updated_at, json_object('pr_id',pr_id,'repo_name',repo_name,'pr_number',pr_number,'login',login,'interactions',interactions,'non_oasis_interactions',non_oasis_interactions,'decision',decision,'reactions_received',reactions_received) AS payload_json FROM pr_participants` },
    { entityType: 'vote', sql: `SELECT github_login||':'||CAST(pr_id AS TEXT) AS entity_id, voted_at AS source_updated_at, json_object('github_login',github_login,'pr_id',pr_id,'repo_name',repo_name,'pr_number',pr_number,'decision',decision,'parent_pr_id',parent_pr_id,'comment_id',comment_id,'voted_at',voted_at) AS payload_json FROM user_votes` },
    { entityType: 'contributor', sql: `SELECT login AS entity_id, NULL AS source_updated_at, json_object('login',login,'avatar_url',avatar_url,'prs_worked',prs_worked,'total_interactions',total_interactions,'non_oasis_interactions',non_oasis_interactions,'reactions_received',reactions_received,'reactions_given',reactions_given,'accepts',accepts,'modifies',modifies,'rejects',rejects,'duplicates',duplicates,'comment_score',comment_score,'peer_score',peer_score,'reaction_score',reaction_score,'trust_score',trust_score,'base_reputation',base_reputation,'modified_reputation',modified_reputation,'rank_90d',rank_90d,'rank_90d_oldest_activity',rank_90d_oldest_activity) AS payload_json FROM contributors` },
  ];
}

export function differingFields(left: Record<string, unknown>, right: Record<string, unknown>): string[] {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  return Array.from(keys).filter(key => JSON.stringify(left[key] ?? null) !== JSON.stringify(right[key] ?? null)).sort();
}

async function compareParity(env: Env, pipelineRunId: string): Promise<{ matches: number; differences: number; changed: number }> {
  const parity = await env.DB.prepare('SELECT canonical_cutoff_at FROM sync_parity_runs WHERE pipeline_run_id = ?')
    .bind(pipelineRunId).first<{ canonical_cutoff_at: string }>();
  if (!parity) throw new Error('Missing parity run');
  await env.DB.prepare('DELETE FROM sync_parity_differences WHERE pipeline_run_id = ?').bind(pipelineRunId).run();
  let matches = 0;
  let differences = 0;
  let changed = 0;

  for (const query of canonicalEntityQueries()) {
    const canonical = await env.DB.prepare(query.sql).all<{ entity_id: string; source_updated_at: string | null; payload_json: string }>();
    const shadow = await env.DB.prepare(`
      SELECT entity_id, source_updated_at, payload_json FROM sync_shadow_entities
       WHERE pipeline_run_id = ? AND entity_type = ?
    `).bind(pipelineRunId, query.entityType).all<{ entity_id: string; source_updated_at: string | null; payload_json: string }>();
    const canonicalMap = new Map((canonical.results ?? []).map(row => [row.entity_id, row]));
    const shadowMap = new Map((shadow.results ?? []).map(row => [row.entity_id, row]));
    const ids = new Set([...canonicalMap.keys(), ...shadowMap.keys()]);
    for (const id of ids) {
      const canonicalRow = canonicalMap.get(id);
      const shadowRow = shadowMap.get(id);
      const sourceUpdatedAt = shadowRow?.source_updated_at ?? canonicalRow?.source_updated_at;
      if (sourceUpdatedAt && sourceUpdatedAt > parity.canonical_cutoff_at) {
        changed += 1;
        await env.DB.prepare(`INSERT INTO sync_parity_differences (pipeline_run_id, entity_type, entity_id, difference_type, created_at) VALUES (?, ?, ?, 'source_changed_during_comparison', ?)`)
          .bind(pipelineRunId, query.entityType, id, isoNow()).run();
        continue;
      }
      if (!canonicalRow || !shadowRow) {
        differences += 1;
        await env.DB.prepare(`INSERT INTO sync_parity_differences (pipeline_run_id, entity_type, entity_id, difference_type, created_at) VALUES (?, ?, ?, ?, ?)`)
          .bind(pipelineRunId, query.entityType, id, canonicalRow ? 'missing_in_shadow' : 'extra_in_shadow', isoNow()).run();
        continue;
      }
      const canonicalPayload = JSON.parse(canonicalRow.payload_json) as Record<string, unknown>;
      const shadowPayload = JSON.parse(shadowRow.payload_json) as Record<string, unknown>;
      const fields = differingFields(canonicalPayload, shadowPayload);
      if (fields.length === 0) matches += 1;
      else {
        differences += 1;
        await env.DB.prepare(`INSERT INTO sync_parity_differences (pipeline_run_id, entity_type, entity_id, difference_type, fields_json, created_at) VALUES (?, ?, ?, 'field_mismatch', ?, ?)`)
          .bind(pipelineRunId, query.entityType, id, JSON.stringify(fields), isoNow()).run();
      }
    }
  }
  return { matches, differences, changed };
}

async function finalizeShadow(env: Env, params: Extract<ShadowSyncParams, { action: 'finalize' }>): Promise<Record<string, number | boolean>> {
  const pipelineRunId = params.pipelineRunId;
  const failedItems = await env.DB.prepare(`SELECT COUNT(*) AS count FROM sync_work_items WHERE pipeline_run_id = ? AND status = 'failed'`)
    .bind(pipelineRunId).first<{ count: number }>();

  const voteJobId = await jobRunId(env.DB, pipelineRunId, 'vote_projection');
  await markSyncJobRunning(env.DB, voteJobId);
  const votes = await projectShadowVotes(env, pipelineRunId);
  await finishSyncJob(env.DB, voteJobId, 'succeeded', { metrics: { votes }, completedItems: votes });

  const duplicateJobId = await jobRunId(env.DB, pipelineRunId, 'duplicate_resolution');
  await markSyncJobRunning(env.DB, duplicateJobId);
  const simulatedActions = await rebuildShadowDuplicates(env, pipelineRunId);
  await finishSyncJob(env.DB, duplicateJobId, 'succeeded', { metrics: { simulated_actions: simulatedActions } });

  const contributorJobId = await jobRunId(env.DB, pipelineRunId, 'contributor_scores');
  await markSyncJobRunning(env.DB, contributorJobId);
  const contributors = await rebuildShadowContributors(env, pipelineRunId);
  await finishSyncJob(env.DB, contributorJobId, 'succeeded', { metrics: { contributors }, completedItems: contributors });

  const cleanupJobId = await jobRunId(env.DB, pipelineRunId, 'orphan_cleanup');
  await markSyncJobRunning(env.DB, cleanupJobId);
  await finishSyncJob(env.DB, cleanupJobId, 'succeeded', { metrics: { inventory_based: true } });

  const comparison = await compareParity(env, pipelineRunId);
  const complete = (failedItems?.count ?? 0) === 0 && comparison.differences === 0;
  const prior = await env.DB.prepare(`
    SELECT status, consecutive_matches FROM sync_parity_runs
     WHERE pipeline_run_id <> ?
     ORDER BY created_at DESC LIMIT 1
  `).bind(pipelineRunId).first<{ status: string; consecutive_matches: number }>();
  const consecutive = complete ? (prior?.status === 'match' ? prior.consecutive_matches : 0) + 1 : 0;
  const eligible = complete && consecutive >= 3;
  await env.DB.prepare(`
    UPDATE sync_parity_runs
       SET status = ?, comparable_entities = ?, matched_entities = ?,
           changed_during_run = ?, difference_count = ?, consecutive_matches = ?,
           eligible_for_cutover = ?, compared_at = ?
     WHERE pipeline_run_id = ?
  `).bind(
    complete ? 'match' : comparison.differences > 0 ? 'mismatch' : 'incomplete',
    comparison.matches + comparison.differences,
    comparison.matches,
    comparison.changed,
    comparison.differences,
    consecutive,
    eligible ? 1 : 0,
    isoNow(),
    pipelineRunId,
  ).run();
  await recordDailyBudget(env.DB, { key: 'workflow_steps', label: 'OASIS Workflow steps', unit: 'steps', limit: WORKFLOW_STEP_LIMIT, consumedDelta: 1 });
  return { votes, contributors, differences: comparison.differences, changed: comparison.changed, eligible };
}

async function continueShadow(env: Env, params: ShadowSyncParams, suffix: string): Promise<void> {
  if (!env.SHADOW_SYNC_WORKFLOW) throw new Error('Shadow Workflow binding is unavailable');
  const today = isoNow().slice(0, 10);
  const budget = await env.DB.prepare(`
    SELECT consumed FROM sync_daily_budgets
     WHERE budget_date = ? AND budget_key = 'workflow_steps'
  `).bind(today).first<{ consumed: number }>();
  if ((budget?.consumed ?? 0) >= WORKFLOW_STEP_LIMIT) {
    const pipelineRunId = 'pipelineRunId' in params ? params.pipelineRunId : null;
    await recordDailyBudget(env.DB, {
      key: 'workflow_steps', label: 'OASIS Workflow steps', unit: 'steps',
      limit: WORKFLOW_STEP_LIMIT, deferredDelta: 1,
    });
    if (pipelineRunId) {
      const now = isoNow();
      await env.DB.batch([
        env.DB.prepare(`
          UPDATE sync_work_items SET status = 'deferred', updated_at = ?
           WHERE pipeline_run_id = ? AND status = 'pending'
        `).bind(now, pipelineRunId),
        env.DB.prepare(`
          UPDATE sync_job_runs
             SET status = 'deferred', finished_at = ?, error_code = 'daily_workflow_budget_exhausted',
                 error_summary = 'Pending work was deferred before exceeding the configured daily Workflow allowance.'
           WHERE pipeline_run_id = ? AND status IN ('queued', 'running')
        `).bind(now, pipelineRunId),
        env.DB.prepare(`
          UPDATE sync_parity_runs SET status = 'incomplete', compared_at = ?
           WHERE pipeline_run_id = ?
        `).bind(now, pipelineRunId),
      ]);
    }
    return;
  }
  const pipeline = 'pipelineRunId' in params ? params.pipelineRunId.slice(0, 8) : 'start';
  const id = `shadow-${pipeline}-${suffix}`.replace(/[^a-zA-Z0-9-_]/g, '-').slice(0, 100);
  try {
    await env.SHADOW_SYNC_WORKFLOW.create({
      id,
      params,
      retention: { successRetention: '1 day', errorRetention: '3 days' },
    });
  } catch (error) {
    // Deterministic continuation IDs make retries idempotent. If a retry sees
    // the already-created instance, obtaining its handle proves it exists.
    try { await env.SHADOW_SYNC_WORKFLOW.get(id); }
    catch { throw error; }
  }
}

export async function startShadowSync(env: Env, legacyPipelineRunId: string, canonicalCutoffAt: string): Promise<string | null> {
  if (!env.SHADOW_SYNC_WORKFLOW || env.ENVIRONMENT !== 'preview') return null;
  const dispatchRunId = await startSyncJob(env.DB, {
    jobKey: 'shadow_sync_dispatch',
    pipelineRunId: legacyPipelineRunId,
    trigger: 'scheduled',
    mode: 'shadow',
  });
  const id = shadowWorkflowInstanceId(legacyPipelineRunId);
  try {
    const instance = await env.SHADOW_SYNC_WORKFLOW.create({
      id,
      params: { action: 'start', legacyPipelineRunId, canonicalCutoffAt },
      retention: { successRetention: '1 day', errorRetention: '3 days' },
    });
    await finishSyncJob(env.DB, dispatchRunId, 'succeeded', {
      metrics: { enqueued: true }, completedItems: 1,
    });
    return instance.id;
  } catch (error) {
    try {
      const instance = await env.SHADOW_SYNC_WORKFLOW.get(id);
      const state = await instance.status();
      if (state.status === 'errored' || state.status === 'terminated' || state.status === 'unknown') {
        await finishSyncJob(env.DB, dispatchRunId, 'failed', {
          metrics: { existing_instance: true },
          errorCode: 'existing_workflow_unavailable',
          error: new Error(state.error?.message ?? `Existing Workflow instance is ${state.status}`),
        });
        return null;
      }
      await finishSyncJob(env.DB, dispatchRunId, 'succeeded', {
        metrics: { enqueued: true, existing_instance: true }, completedItems: 1,
      });
      return instance.id;
    } catch {
      await finishSyncJob(env.DB, dispatchRunId, 'failed', {
        errorCode: 'workflow_dispatch_failed', error,
      });
      console.error(JSON.stringify({
        event: 'shadow_sync_dispatch_failed',
        legacy_pipeline_run_id: legacyPipelineRunId,
      }));
      return null;
    }
  }
}

export class ShadowSyncWorkflow extends WorkflowEntrypoint<Env, ShadowSyncParams> {
  async run(event: WorkflowEvent<ShadowSyncParams>, step: WorkflowStep): Promise<Record<string, number | boolean>> {
    return step.do('process bounded shadow sync work', {
      retries: { limit: 3, delay: '10 seconds', backoff: 'exponential' },
      timeout: '15 minutes',
    }, async context => {
      if (event.payload.action === 'start') return processInventory(this.env, event, context.attempt);
      if (event.payload.action === 'repository') return processRepository(this.env, event.payload);
      if (event.payload.action === 'pull_request') return processPullRequest(this.env, event.payload);
      return finalizeShadow(this.env, event.payload);
    });
  }
}
