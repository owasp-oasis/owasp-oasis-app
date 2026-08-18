/**
 * Production registration export to Google Sheets.
 *
 * The Worker reads D1 directly and sends an HMAC-signed payload to a Google
 * Apps Script web app. Registration data, webhook URLs, and signatures must
 * never be written to Worker logs.
 */

import type { Env } from './types.js';
import { setSyncState } from './db.js';

export const GITHUB_SYNC_CRON = '0 */4 * * *';
export const SHEETS_SYNC_CRON = '15 * * * *';

const RESPONSE_LIMIT_BYTES = 8_192;
const REQUEST_TIMEOUT_MS = 30_000;

export interface RegistrationExportRow {
  id: number;
  name: string;
  email: string;
  github: string;
  role: string;
  created_at: string;
}

export interface SheetsSyncPayload {
  version: 1;
  sent_at: string;
  registrations: RegistrationExportRow[];
}

export interface SheetsSyncEnvelope {
  payload: string;
  signature: string;
}

interface SheetsSyncResponse {
  ok: boolean;
  count?: number;
  error?: string;
}

export type ScheduledTask = 'github_sync' | 'sheets_sync' | null;

export function scheduledTaskForCron(cron: string): ScheduledTask {
  if (cron === GITHUB_SYNC_CRON) return 'github_sync';
  if (cron === SHEETS_SYNC_CRON) return 'sheets_sync';
  return null;
}

function bytesToHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function signSheetsPayload(payload: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return bytesToHex(signature);
}

export async function createSheetsSyncEnvelope(
  registrations: RegistrationExportRow[],
  secret: string,
  sentAt = new Date(),
): Promise<SheetsSyncEnvelope> {
  const payload: SheetsSyncPayload = {
    version: 1,
    sent_at: sentAt.toISOString(),
    registrations,
  };
  const serialized = JSON.stringify(payload);
  return {
    payload: serialized,
    signature: await signSheetsPayload(serialized, secret),
  };
}

async function readLimitedText(response: Response, maxBytes: number): Promise<string> {
  if (!response.body) return '';

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let output = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel('Response exceeded limit');
      throw new Error('Sheets sync response exceeded size limit');
    }
    output += decoder.decode(value, { stream: true });
  }

  return output + decoder.decode();
}

async function recordSyncFailure(db: D1Database, failedAt: string): Promise<void> {
  try {
    await setSyncState(db, 'sheets_sync_last_failure', failedAt);
    await setSyncState(db, 'sheets_sync_status', 'failed');
  } catch {
    console.error(JSON.stringify({ event: 'sheets_sync_state_write_failed' }));
  }
}

export async function syncRegistrationsToSheets(
  env: Env,
  now = new Date(),
  fetcher: typeof fetch = fetch,
): Promise<{ count: number }> {
  const startedAt = Date.now();
  const attemptedAt = now.toISOString();

  try {
    if (!env.DB) throw new Error('D1 binding is unavailable');
    if (!env.GOOGLE_SHEETS_WEBHOOK || !env.SHEETS_SYNC_SECRET) {
      throw new Error('Sheets sync secrets are not configured');
    }

    const result = await env.DB.prepare(
      'SELECT id, name, email, github, role, created_at FROM registrations ORDER BY created_at DESC',
    ).all<RegistrationExportRow>();
    const registrations = result.results ?? [];
    const envelope = await createSheetsSyncEnvelope(registrations, env.SHEETS_SYNC_SECRET, now);

    const response = await fetcher(env.GOOGLE_SHEETS_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(envelope),
      redirect: 'follow',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) throw new Error(`Sheets endpoint returned HTTP ${response.status}`);

    const responseText = await readLimitedText(response, RESPONSE_LIMIT_BYTES);
    let responseBody: SheetsSyncResponse;
    try {
      responseBody = JSON.parse(responseText) as SheetsSyncResponse;
    } catch {
      throw new Error('Sheets endpoint returned invalid JSON');
    }
    if (responseBody.ok !== true || responseBody.count !== registrations.length) {
      throw new Error('Sheets endpoint rejected the export');
    }

    await setSyncState(env.DB, 'sheets_sync_last_success', attemptedAt);
    await setSyncState(env.DB, 'sheets_sync_last_count', String(registrations.length));
    await setSyncState(env.DB, 'sheets_sync_status', 'ok');

    console.log(JSON.stringify({
      event: 'sheets_sync_completed',
      count: registrations.length,
      duration_ms: Date.now() - startedAt,
    }));
    return { count: registrations.length };
  } catch (err) {
    if (env.DB) await recordSyncFailure(env.DB, attemptedAt);
    console.error(JSON.stringify({
      event: 'sheets_sync_failed',
      duration_ms: Date.now() - startedAt,
      reason: (err as Error)?.message ?? 'unknown error',
    }));
    throw err;
  }
}
