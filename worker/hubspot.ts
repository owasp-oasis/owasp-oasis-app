/** Durable, privacy-safe HubSpot contact synchronization. */

import type { Env } from './types.js';

const HUBSPOT_CONTACTS_URL = 'https://api.hubapi.com/crm/v3/objects/contacts';
const REQUEST_TIMEOUT_MS = 5_000;
const CLAIM_TIMEOUT_MS = 10 * 60 * 1_000;
const MAX_RETRY_DELAY_MS = 24 * 60 * 60 * 1_000;
const PROPERTY_NAME_RE = /^[a-z][a-z0-9_]{0,99}$/;
const RESERVED_PROPERTIES = new Set(['email', 'firstname', 'lastname']);
const MAPPABLE_FIELDS = ['github', 'role', 'source', 'organization', 'submitted_at'] as const;

export const HUBSPOT_SYNC_CRON = '15 * * * *';

export interface HubSpotSubmission {
  source: 'registration' | 'application';
  email: string;
  name: string;
  github: string;
  role: string;
  organization: string;
  submitted_at: string;
}

type HubSpotPropertyMap = Partial<Record<(typeof MAPPABLE_FIELDS)[number], string>>;
type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

interface QueueRow {
  id: number;
  payload_json: string;
  attempts: number;
}

interface ProcessQueueOptions {
  now?: Date | string | number;
  limit?: number;
  fetcher?: Fetcher;
}

export class HubSpotSyncError extends Error {
  constructor(public readonly code: string, public readonly status: number | null = null) {
    super(code);
    this.name = 'HubSpotSyncError';
  }
}

function toIso(value: Date | string | number): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error('Invalid sync timestamp');
  return date.toISOString();
}

export function submissionKey(submission: HubSpotSubmission): string {
  const email = submission.email.trim().toLowerCase();
  if (!email) throw new Error('HubSpot submission email is required');
  if (submission.source === 'registration') return email;
  return `${email}:${submission.role.trim().toLowerCase()}`;
}

export function prepareHubSpotEnqueue(
  db: D1Database,
  submission: HubSpotSubmission,
  now: Date = new Date(),
): D1PreparedStatement {
  const timestamp = toIso(now);
  return db.prepare(`
    INSERT INTO hubspot_sync_queue (
      source_type, source_key, payload_json, status, attempts,
      next_attempt_at, created_at, updated_at
    ) VALUES (?, ?, ?, 'pending', 0, ?, ?, ?)
    ON CONFLICT(source_type, source_key) DO UPDATE SET
      payload_json = excluded.payload_json,
      status = CASE
        WHEN hubspot_sync_queue.status = 'synced' THEN 'synced'
        ELSE 'pending'
      END,
      next_attempt_at = CASE
        WHEN hubspot_sync_queue.status = 'synced' THEN hubspot_sync_queue.next_attempt_at
        ELSE excluded.next_attempt_at
      END,
      locked_at = CASE
        WHEN hubspot_sync_queue.status = 'synced' THEN hubspot_sync_queue.locked_at
        ELSE NULL
      END,
      updated_at = excluded.updated_at
  `).bind(
    submission.source,
    submissionKey(submission),
    JSON.stringify(submission),
    timestamp,
    timestamp,
    timestamp,
  );
}

export async function enqueueHubSpotSync(
  db: D1Database,
  submission: HubSpotSubmission,
  now: Date = new Date(),
): Promise<void> {
  await prepareHubSpotEnqueue(db, submission, now).run();
}

export function parsePropertyMap(rawMap: string | undefined): HubSpotPropertyMap {
  if (!rawMap) return {};
  let candidate: unknown;
  try {
    candidate = JSON.parse(rawMap);
  } catch {
    return {};
  }
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return {};

  const input = candidate as Record<string, unknown>;
  const result: HubSpotPropertyMap = {};
  for (const field of MAPPABLE_FIELDS) {
    const property = input[field];
    if (typeof property === 'string' && PROPERTY_NAME_RE.test(property) && !RESERVED_PROPERTIES.has(property)) {
      result[field] = property;
    }
  }
  return result;
}

export function buildMappedProperties(
  submission: HubSpotSubmission,
  rawMap: string | undefined,
): Record<string, string> {
  const propertyMap = parsePropertyMap(rawMap);
  const properties: Record<string, string> = {};
  for (const field of MAPPABLE_FIELDS) {
    const property = propertyMap[field];
    const value = submission[field];
    if (!property || value === '') continue;
    if (field === 'submitted_at') {
      const milliseconds = Date.parse(value);
      if (Number.isFinite(milliseconds)) properties[property] = String(milliseconds);
    } else {
      properties[property] = value;
    }
  }
  return properties;
}

export function splitName(name: string): { firstname: string; lastname: string } {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return {
    firstname: parts[0] ?? '',
    lastname: parts.length > 1 ? parts.slice(1).join(' ') : '',
  };
}

async function hubSpotRequest(url: string, options: RequestInit, fetcher: Fetcher): Promise<number> {
  const response = await fetcher(url, {
    ...options,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const status = response.status;
  if (response.body) {
    try {
      await response.body.cancel();
    } catch {
      // Never turn response-body cleanup into a retry or expose the body.
    }
  }
  return status;
}

function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

async function patchExistingContact(
  email: string,
  properties: Record<string, string>,
  token: string,
  fetcher: Fetcher,
): Promise<void> {
  if (Object.keys(properties).length === 0) return;
  const status = await hubSpotRequest(
    `${HUBSPOT_CONTACTS_URL}/${encodeURIComponent(email)}?idProperty=email`,
    { method: 'PATCH', headers: authHeaders(token), body: JSON.stringify({ properties }) },
    fetcher,
  );
  if (status < 200 || status >= 300) throw new HubSpotSyncError(`http_${status}`, status);
}

export async function syncHubSpotContact(
  submission: HubSpotSubmission,
  token: string,
  rawPropertyMap = '',
  fetcher: Fetcher = fetch,
): Promise<{ created: boolean }> {
  if (!token) throw new HubSpotSyncError('token_missing');
  const email = submission.email.trim().toLowerCase();
  if (!email) throw new HubSpotSyncError('email_missing');

  const lookupStatus = await hubSpotRequest(
    `${HUBSPOT_CONTACTS_URL}/${encodeURIComponent(email)}?idProperty=email`,
    { method: 'GET', headers: authHeaders(token) },
    fetcher,
  );
  const mappedProperties = buildMappedProperties(submission, rawPropertyMap);
  if (lookupStatus >= 200 && lookupStatus < 300) {
    await patchExistingContact(email, mappedProperties, token, fetcher);
    return { created: false };
  }
  if (lookupStatus !== 404) throw new HubSpotSyncError(`http_${lookupStatus}`, lookupStatus);

  const { firstname, lastname } = splitName(submission.name);
  const createProperties: Record<string, string> = { email, ...mappedProperties };
  if (firstname) createProperties.firstname = firstname;
  if (lastname) createProperties.lastname = lastname;

  const createStatus = await hubSpotRequest(
    HUBSPOT_CONTACTS_URL,
    { method: 'POST', headers: authHeaders(token), body: JSON.stringify({ properties: createProperties }) },
    fetcher,
  );
  if (createStatus >= 200 && createStatus < 300) return { created: true };
  if (createStatus === 409) {
    await patchExistingContact(email, mappedProperties, token, fetcher);
    return { created: false };
  }
  throw new HubSpotSyncError(`http_${createStatus}`, createStatus);
}

export function retryAt(attempt: number, now: Date = new Date()): string {
  const exponent = Math.max(0, Math.min(Number(attempt) - 1, 20));
  const delay = Math.min(60_000 * (2 ** exponent), MAX_RETRY_DELAY_MS);
  return new Date(now.getTime() + delay).toISOString();
}

function safeErrorCode(error: unknown): string {
  if (error instanceof HubSpotSyncError) return error.code;
  if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) return 'timeout';
  return 'network_error';
}

async function claimJob(db: D1Database, row: QueueRow, now: string, staleBefore: string): Promise<boolean> {
  const result = await db.prepare(`
    UPDATE hubspot_sync_queue
       SET status = 'processing', locked_at = ?, updated_at = ?
     WHERE id = ?
       AND (
         (status = 'pending' AND next_attempt_at <= ?)
         OR (status = 'processing' AND (locked_at IS NULL OR locked_at <= ?))
       )
  `).bind(now, now, row.id, now, staleBefore).run();
  return Number(result.meta.changes ?? 0) === 1;
}

export async function processHubSpotQueue(
  env: Pick<Env, 'DB' | 'HUBSPOT_TOKEN' | 'HUBSPOT_PROPERTY_MAP'>,
  options: ProcessQueueOptions = {},
): Promise<{ processed: number; succeeded: number; failed: number; skipped: boolean }> {
  if (!env.DB || !env.HUBSPOT_TOKEN) return { processed: 0, succeeded: 0, failed: 0, skipped: true };

  const nowDate = options.now instanceof Date ? options.now : new Date(options.now ?? Date.now());
  const now = toIso(nowDate);
  const staleBefore = new Date(nowDate.getTime() - CLAIM_TIMEOUT_MS).toISOString();
  const limit = Math.max(1, Math.min(Number(options.limit) || 25, 100));
  const fetcher = options.fetcher ?? fetch;
  const rows = await env.DB.prepare(`
    SELECT id, payload_json, attempts
      FROM hubspot_sync_queue
     WHERE (status = 'pending' AND next_attempt_at <= ?)
        OR (status = 'processing' AND (locked_at IS NULL OR locked_at <= ?))
     ORDER BY created_at ASC, id ASC
     LIMIT ?
  `).bind(now, staleBefore, limit).all<QueueRow>();

  let processed = 0;
  let succeeded = 0;
  let failed = 0;
  for (const row of rows.results) {
    if (!await claimJob(env.DB, row, now, staleBefore)) continue;
    processed += 1;
    try {
      const submission = JSON.parse(row.payload_json) as HubSpotSubmission;
      await syncHubSpotContact(submission, env.HUBSPOT_TOKEN, env.HUBSPOT_PROPERTY_MAP ?? '', fetcher);
      await env.DB.prepare(`
        UPDATE hubspot_sync_queue
           SET status = 'synced', synced_at = ?, locked_at = NULL,
               last_error = NULL, updated_at = ?
         WHERE id = ?
      `).bind(now, now, row.id).run();
      succeeded += 1;
    } catch (error) {
      const attempts = Number(row.attempts || 0) + 1;
      await env.DB.prepare(`
        UPDATE hubspot_sync_queue
           SET status = 'pending', attempts = ?, next_attempt_at = ?,
               locked_at = NULL, last_error = ?, updated_at = ?
         WHERE id = ?
      `).bind(attempts, retryAt(attempts, nowDate), safeErrorCode(error), now, row.id).run();
      failed += 1;
    }
  }

  console.log(JSON.stringify({ event: 'hubspot_sync_batch', processed, succeeded, failed }));
  return { processed, succeeded, failed, skipped: false };
}

export function scheduleHubSpotSync(ctx: ExecutionContext, env: Env, limit = 1): void {
  if (!env.DB || !env.HUBSPOT_TOKEN) return;
  ctx.waitUntil(processHubSpotQueue(env, { limit }).catch(error => {
    console.error(JSON.stringify({ event: 'hubspot_sync_background_failed', reason: safeErrorCode(error) }));
  }));
}
