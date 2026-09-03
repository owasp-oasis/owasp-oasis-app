import { getRequestPrincipal, roleAllows } from '../authorization.js';
import { jsonErr, jsonOk, validateCSRF } from '../security.js';
import type { Env } from '../types.js';

interface CancelRunRow {
  id: string;
  pipeline_run_id: string | null;
  workflow_instance_id: string | null;
  job_key: string;
  mode: 'legacy' | 'shadow' | 'live';
  status: string;
}

interface WorkflowReference {
  workflow_instance_id: string;
}

type TerminationOutcome = 'terminated' | 'not_running' | 'untracked' | 'failed';

const WORKSPACE_PARENT_KEYS = new Set([
  'legacy_workspace_sync',
  'canonical_workspace_sync',
]);

function workflowBinding(env: Env, run: CancelRunRow, pipelineScoped: boolean) {
  if (run.mode === 'shadow') return env.SHADOW_SYNC_WORKFLOW;
  if (pipelineScoped) return env.CANONICAL_SYNC_WORKFLOW;
  if (run.job_key === 'hubspot_contacts') return env.HUBSPOT_SYNC_WORKFLOW;
  if (run.job_key === 'orphan_cleanup') return env.ORPHAN_CLEANUP_WORKFLOW;
  return env.MANUAL_SYNC_JOB_WORKFLOW;
}

async function terminateWorkflow(
  env: Env,
  run: CancelRunRow,
  pipelineScoped: boolean,
  workflowInstanceId: string | null,
): Promise<TerminationOutcome> {
  const binding = workflowBinding(env, run, pipelineScoped);
  if (!binding || !workflowInstanceId) return 'untracked';
  try {
    const instance = await binding.get(workflowInstanceId);
    const state = await instance.status();
    if (
      state.status !== 'queued'
      && state.status !== 'running'
      && state.status !== 'paused'
      && state.status !== 'waiting'
      && state.status !== 'waitingForPause'
    ) {
      return 'not_running';
    }
    await instance.terminate();
    return 'terminated';
  } catch (error) {
    console.error(JSON.stringify({
      event: 'sync_workflow_termination_failed',
      job_run_id: run.id,
      workflow_instance_id: workflowInstanceId,
      error: error instanceof Error ? error.message : 'unknown_error',
    }));
    return 'failed';
  }
}

export async function handleCancelSyncRun(
  request: Request,
  env: Env,
  runId: string,
): Promise<Response> {
  const principal = await getRequestPrincipal(request, env);
  if (!principal.session) return jsonErr('Authentication required', 401, request);
  if (!roleAllows(principal.role, 'admin')) return jsonErr('Admin role required', 403, request);
  if (!validateCSRF(request)) return jsonErr('Invalid security token', 403, request);
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(runId)) {
    return jsonErr('Invalid run ID', 400, request);
  }

  const run = await env.DB.prepare(`
    SELECT id, pipeline_run_id, workflow_instance_id, job_key, mode, status
      FROM sync_job_runs WHERE id = ?
  `).bind(runId).first<CancelRunRow>();
  if (!run) return jsonErr('Sync run not found', 404, request);
  if (run.status !== 'queued' && run.status !== 'running') {
    return jsonErr('Only queued or running sync jobs can be cancelled', 409, request);
  }

  const parent = run.pipeline_run_id
    ? await env.DB.prepare(`
        SELECT id FROM sync_job_runs
         WHERE pipeline_run_id = ?
           AND job_key IN ('legacy_workspace_sync', 'canonical_workspace_sync')
         LIMIT 1
      `).bind(run.pipeline_run_id).first<{ id: string }>()
    : null;
  const pipelineScoped = Boolean(
    run.pipeline_run_id
    && (run.mode === 'shadow' || parent || WORKSPACE_PARENT_KEYS.has(run.job_key)),
  );

  const workflowReference = pipelineScoped && run.pipeline_run_id
    ? await env.DB.prepare(`
        SELECT workflow_instance_id
          FROM sync_job_runs
         WHERE pipeline_run_id = ? AND workflow_instance_id IS NOT NULL
           AND status IN ('queued', 'running')
         ORDER BY CASE WHEN id = ? THEN 0 ELSE 1 END, started_at DESC
         LIMIT 1
      `).bind(run.pipeline_run_id, run.id).first<WorkflowReference>()
    : null;
  const workflowInstanceId = workflowReference?.workflow_instance_id ?? run.workflow_instance_id;
  const now = new Date().toISOString();
  const reason = 'Cancelled by an administrator.';
  const auditId = crypto.randomUUID();

  const statements: D1PreparedStatement[] = [];
  if (pipelineScoped && run.pipeline_run_id) {
    statements.push(
      env.DB.prepare(`
        UPDATE sync_job_runs
           SET status = 'failed', finished_at = ?,
               duration_ms = MAX(0, CAST((julianday(?) - julianday(started_at)) * 86400000 AS INTEGER)),
               failed_items = CASE WHEN failed_items = 0 THEN 1 ELSE failed_items END,
               error_code = 'cancelled_by_admin', error_summary = ?
         WHERE pipeline_run_id = ? AND status IN ('queued', 'running')
      `).bind(now, now, reason, run.pipeline_run_id),
      env.DB.prepare(`
        UPDATE sync_work_items
           SET status = 'failed', leased_at = NULL, lease_expires_at = NULL,
               last_error_code = 'cancelled_by_admin', last_error_summary = ?, updated_at = ?
         WHERE pipeline_run_id = ? AND status IN ('pending', 'leased', 'deferred')
      `).bind(reason, now, run.pipeline_run_id),
    );
    if (run.mode !== 'shadow') {
      statements.push(
        env.DB.prepare(`
          UPDATE sync_state SET value = '0'
           WHERE key = 'sync_running'
             AND EXISTS (
               SELECT 1 FROM sync_pipeline_locks
                WHERE lock_key = 'canonical_workspace_sync' AND pipeline_run_id = ?
             )
        `).bind(run.pipeline_run_id),
        env.DB.prepare(`
          UPDATE sync_state SET value = 'cancelled'
           WHERE key = 'canonical_pipeline_phase'
             AND EXISTS (
               SELECT 1 FROM sync_state current
                WHERE current.key = 'canonical_pipeline_run_id' AND current.value = ?
             )
        `).bind(run.pipeline_run_id),
        env.DB.prepare(`
          UPDATE sync_state SET value = ?
           WHERE key = 'canonical_pipeline_updated_at'
             AND EXISTS (
               SELECT 1 FROM sync_state current
                WHERE current.key = 'canonical_pipeline_run_id' AND current.value = ?
             )
        `).bind(now, run.pipeline_run_id),
        env.DB.prepare(`
          DELETE FROM sync_state
           WHERE key = 'sync_cursor'
             AND EXISTS (
               SELECT 1 FROM sync_pipeline_locks
                WHERE lock_key = 'canonical_workspace_sync' AND pipeline_run_id = ?
             )
        `).bind(run.pipeline_run_id),
        env.DB.prepare(`
          DELETE FROM sync_pipeline_locks
           WHERE lock_key = 'canonical_workspace_sync' AND pipeline_run_id = ?
        `).bind(run.pipeline_run_id),
      );
    }
  } else {
    statements.push(
      env.DB.prepare(`
        UPDATE sync_job_runs
           SET status = 'failed', finished_at = ?,
               duration_ms = MAX(0, CAST((julianday(?) - julianday(started_at)) * 86400000 AS INTEGER)),
               failed_items = CASE WHEN failed_items = 0 THEN 1 ELSE failed_items END,
               error_code = 'cancelled_by_admin', error_summary = ?
         WHERE id = ? AND status IN ('queued', 'running')
      `).bind(now, now, reason, run.id),
      env.DB.prepare(`
        UPDATE sync_work_items
           SET status = 'failed', leased_at = NULL, lease_expires_at = NULL,
               last_error_code = 'cancelled_by_admin', last_error_summary = ?, updated_at = ?
         WHERE job_run_id = ? AND status IN ('pending', 'leased', 'deferred')
      `).bind(reason, now, run.id),
      env.DB.prepare('DELETE FROM sync_state WHERE key = ?')
        .bind(`manual_sync_cursor:${run.id}`),
    );
  }

  statements.push(
    env.DB.prepare(`
      INSERT INTO sync_job_events (
        job_run_id, event_type, message, details_json, created_at
      ) VALUES (?, 'cancelled_by_admin', ?, '{}', ?)
    `).bind(run.id, reason, now),
    env.DB.prepare(`
      INSERT INTO privileged_action_audit (
        id, github_user_id, github_login, role, action,
        target_type, target_id, outcome, created_at
      ) VALUES (?, ?, ?, ?, 'sync_job.cancel', 'sync_job_run', ?, 'succeeded', ?)
    `).bind(
      auditId,
      principal.session.github_user_id,
      principal.session.github_login,
      principal.role,
      run.id,
      now,
    ),
  );

  await env.DB.batch(statements);
  const termination = await terminateWorkflow(
    env,
    run,
    pipelineScoped,
    workflowInstanceId,
  );
  console.log(JSON.stringify({
    event: 'sync_job_cancelled',
    job_run_id: run.id,
    pipeline_run_id: pipelineScoped ? run.pipeline_run_id : null,
    workflow_termination: termination,
  }));

  return jsonOk({
    run_id: run.id,
    pipeline_run_id: pipelineScoped ? run.pipeline_run_id : null,
    status: 'failed',
    workflow_termination: termination,
  }, request, { cache: 'no-store' });
}
