/**
 * Durable HubSpot contact synchronization.
 *
 * Form handlers store an immutable submission and its outbox job in one D1
 * transaction. Request-path processing is opportunistic; the hourly cron is
 * the durable retry mechanism. Logs and stored errors never contain contact
 * data, access tokens, or HubSpot response bodies.
 */

const HUBSPOT_CONTACTS_URL = 'https://api.hubapi.com/crm/v3/objects/contacts';
const REQUEST_TIMEOUT_MS = 5_000;
const CLAIM_TIMEOUT_MS = 10 * 60 * 1_000;
const MAX_RETRY_DELAY_MS = 24 * 60 * 60 * 1_000;
const PROPERTY_NAME_RE = /^[a-z][a-z0-9_]{0,99}$/;
const RESERVED_PROPERTIES = new Set(['email', 'firstname', 'lastname']);
const MAPPABLE_FIELDS = ['github', 'role', 'source', 'organization', 'submitted_at'];

export class HubSpotSyncError extends Error {
  constructor(code, status = null) {
    super(code);
    this.name = 'HubSpotSyncError';
    this.code = code;
    this.status = status;
  }
}

function toIso(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error('Invalid sync timestamp');
  return date.toISOString();
}

export function submissionKey(submission) {
  const email = String(submission.email || '').trim().toLowerCase();
  if (!email) throw new Error('HubSpot submission email is required');
  if (submission.source === 'registration') return email;
  if (submission.source === 'application') {
    return `${email}:${String(submission.role || '').trim().toLowerCase()}`;
  }
  throw new Error('Unsupported HubSpot submission source');
}

export function prepareHubSpotEnqueue(db, submission, now = new Date()) {
  const timestamp = toIso(now);
  const sourceKey = submissionKey(submission);
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
    sourceKey,
    JSON.stringify(submission),
    timestamp,
    timestamp,
    timestamp,
  );
}

export async function enqueueHubSpotSync(db, submission, now = new Date()) {
  await prepareHubSpotEnqueue(db, submission, now).run();
}

export function parsePropertyMap(rawMap) {
  if (!rawMap || typeof rawMap !== 'string') return {};

  let candidate;
  try {
    candidate = JSON.parse(rawMap);
  } catch {
    return {};
  }
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return {};

  const result = {};
  for (const field of MAPPABLE_FIELDS) {
    const property = candidate[field];
    if (
      typeof property === 'string' &&
      PROPERTY_NAME_RE.test(property) &&
      !RESERVED_PROPERTIES.has(property)
    ) {
      result[field] = property;
    }
  }
  return result;
}

export function buildMappedProperties(submission, rawMap) {
  const propertyMap = parsePropertyMap(rawMap);
  const properties = {};

  for (const field of MAPPABLE_FIELDS) {
    const property = propertyMap[field];
    const value = submission[field];
    if (!property || value === null || value === undefined || value === '') continue;

    if (field === 'submitted_at') {
      const milliseconds = Date.parse(value);
      if (Number.isFinite(milliseconds)) properties[property] = String(milliseconds);
    } else {
      properties[property] = String(value);
    }
  }
  return properties;
}

export function splitName(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  return {
    firstname: parts[0] || '',
    lastname: parts.length > 1 ? parts.slice(1).join(' ') : '',
  };
}

async function hubSpotRequest(url, options, fetcher) {
  const response = await fetcher(url, {
    ...options,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const status = response.status;
  if (response.body) {
    try {
      await response.body.cancel();
    } catch {
      // Response cleanup must not turn a completed HubSpot request into a
      // retry. The response body is intentionally never read or logged.
    }
  }
  return status;
}

function authHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

async function patchExistingContact(email, properties, token, fetcher) {
  if (Object.keys(properties).length === 0) return;
  const status = await hubSpotRequest(
    `${HUBSPOT_CONTACTS_URL}/${encodeURIComponent(email)}?idProperty=email`,
    {
      method: 'PATCH',
      headers: authHeaders(token),
      body: JSON.stringify({ properties }),
    },
    fetcher,
  );
  if (status < 200 || status >= 300) throw new HubSpotSyncError(`http_${status}`, status);
}

export async function syncHubSpotContact(submission, token, rawPropertyMap = '', fetcher = fetch) {
  if (!token) throw new HubSpotSyncError('token_missing');

  const email = String(submission.email || '').trim().toLowerCase();
  if (!email) throw new HubSpotSyncError('email_missing');

  const headers = authHeaders(token);
  const lookupStatus = await hubSpotRequest(
    `${HUBSPOT_CONTACTS_URL}/${encodeURIComponent(email)}?idProperty=email`,
    { method: 'GET', headers },
    fetcher,
  );
  const mappedProperties = buildMappedProperties(submission, rawPropertyMap);

  if (lookupStatus >= 200 && lookupStatus < 300) {
    // Existing HubSpot names may have been curated by the team. Only update
    // explicitly configured OASIS-owned custom properties.
    await patchExistingContact(email, mappedProperties, token, fetcher);
    return { created: false };
  }
  if (lookupStatus !== 404) throw new HubSpotSyncError(`http_${lookupStatus}`, lookupStatus);

  const { firstname, lastname } = splitName(submission.name);
  const createProperties = { email, ...mappedProperties };
  if (firstname) createProperties.firstname = firstname;
  if (lastname) createProperties.lastname = lastname;

  const createStatus = await hubSpotRequest(
    HUBSPOT_CONTACTS_URL,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({ properties: createProperties }),
    },
    fetcher,
  );
  if (createStatus >= 200 && createStatus < 300) return { created: true };

  // Another request may have created the contact after our lookup. Treat that
  // race as an update without overwriting HubSpot-owned name fields.
  if (createStatus === 409) {
    await patchExistingContact(email, mappedProperties, token, fetcher);
    return { created: false };
  }
  throw new HubSpotSyncError(`http_${createStatus}`, createStatus);
}

export function retryAt(attempt, now = new Date()) {
  const exponent = Math.max(0, Math.min(Number(attempt) - 1, 20));
  const delay = Math.min(60_000 * (2 ** exponent), MAX_RETRY_DELAY_MS);
  return new Date(now.getTime() + delay).toISOString();
}

function safeErrorCode(error) {
  if (error instanceof HubSpotSyncError) return error.code;
  if (error?.name === 'TimeoutError' || error?.name === 'AbortError') return 'timeout';
  return 'network_error';
}

async function claimJob(db, row, now, staleBefore) {
  const result = await db.prepare(`
    UPDATE hubspot_sync_queue
       SET status = 'processing', locked_at = ?, updated_at = ?
     WHERE id = ?
       AND (
         (status = 'pending' AND next_attempt_at <= ?)
         OR
         (status = 'processing' AND (locked_at IS NULL OR locked_at <= ?))
       )
  `).bind(now, now, row.id, now, staleBefore).run();
  return Number(result?.meta?.changes || 0) === 1;
}

export async function processHubSpotQueue(env, options = {}) {
  if (!env.DB || !env.HUBSPOT_TOKEN) return { processed: 0, succeeded: 0, failed: 0, skipped: true };

  const nowDate = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  const now = toIso(nowDate);
  const staleBefore = new Date(nowDate.getTime() - CLAIM_TIMEOUT_MS).toISOString();
  const limit = Math.max(1, Math.min(Number(options.limit) || 25, 100));
  const fetcher = options.fetcher || fetch;
  const rows = await env.DB.prepare(`
    SELECT id, payload_json, attempts
      FROM hubspot_sync_queue
     WHERE (status = 'pending' AND next_attempt_at <= ?)
        OR (status = 'processing' AND (locked_at IS NULL OR locked_at <= ?))
     ORDER BY created_at ASC, id ASC
     LIMIT ?
  `).bind(now, staleBefore, limit).all();

  let processed = 0;
  let succeeded = 0;
  let failed = 0;

  for (const row of rows.results || []) {
    if (!await claimJob(env.DB, row, now, staleBefore)) continue;
    processed += 1;

    try {
      const submission = JSON.parse(row.payload_json);
      await syncHubSpotContact(
        submission,
        env.HUBSPOT_TOKEN,
        env.HUBSPOT_PROPERTY_MAP || '',
        fetcher,
      );
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

  console.log(JSON.stringify({
    event: 'hubspot_sync_batch',
    processed,
    succeeded,
    failed,
  }));
  return { processed, succeeded, failed, skipped: false };
}

export function scheduleHubSpotSync(ctx, env, limit = 1) {
  if (!ctx || !env.DB || !env.HUBSPOT_TOKEN) return;
  ctx.waitUntil(
    processHubSpotQueue(env, { limit }).catch(error => {
      console.error(JSON.stringify({
        event: 'hubspot_sync_background_failed',
        reason: safeErrorCode(error),
      }));
    }),
  );
}
