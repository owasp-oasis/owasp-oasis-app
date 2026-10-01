import type { Env } from './types.js';
import type { HubSpotSubmission } from './hubspot.js';
import { WELCOME_EMAIL_HTML, WELCOME_EMAIL_SUBJECT, WELCOME_EMAIL_TEXT } from './welcomeEmailTemplate.js';

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type EmailEnv = Pick<Env, 'DB' | 'HUBSPOT_TOKEN'> & Partial<Env>;
interface Receipt { status: string; sent_at: string | null }
const CONTACTS = 'https://api.hubapi.com/crm/v3/objects/contacts/';
const DATE_PROPERTY = 'welcome_email_sent_date';

class WelcomeEmailError extends Error {
  constructor(code: string) { super(code); this.name = 'WelcomeEmailError'; }
}

export function shouldSendWelcomeEmail(submission: HubSpotSubmission, env: Partial<Env>): boolean {
  if (submission.source !== 'registration' || !submission.welcome_environment
    || submission.welcome_environment !== env.ENVIRONMENT) return false;
  if (env.WELCOME_EMAIL_MODE === 'live') return env.ENVIRONMENT === 'production';
  return env.WELCOME_EMAIL_MODE === 'test' && Boolean(env.WELCOME_EMAIL_TEST_RECIPIENT)
    && submission.email.trim().toLowerCase() === env.WELCOME_EMAIL_TEST_RECIPIENT?.trim().toLowerCase();
}

function sendDate(value: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(value));
  const fields = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${fields.year}-${fields.month}-${fields.day}`;
}

/** Does not emit contact details, provider response bodies, or message IDs into logs. */
export async function deliverWelcomeEmail(
  submission: HubSpotSubmission, env: EmailEnv, fetcher: Fetcher = fetch, now = new Date(),
): Promise<void> {
  if (!shouldSendWelcomeEmail(submission, env)) return;
  if (!env.WELCOME_EMAIL || !env.WELCOME_EMAIL_FROM || !env.HUBSPOT_TOKEN) {
    throw new WelcomeEmailError('welcome_configuration_missing');
  }
  const email = submission.email.trim().toLowerCase();
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(email));
  const key = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  const environment = env.ENVIRONMENT!;
  const timestamp = now.toISOString();
  await env.DB.prepare(`INSERT OR IGNORE INTO welcome_email_deliveries
    (email_hash, environment, status, updated_at) VALUES (?, ?, 'pending', ?)`)
    .bind(key, environment, timestamp).run();
  const receipt = await env.DB.prepare(`SELECT status, sent_at FROM welcome_email_deliveries
    WHERE email_hash = ? AND environment = ?`).bind(key, environment).first<Receipt>();
  if (!receipt) throw new WelcomeEmailError('welcome_receipt_missing');
  if (receipt.status === 'tracked') return;
  // A crash after provider acceptance cannot safely be distinguished from a failed send.
  // Hold it for reconciliation instead of risking a duplicate on the queue retry.
  if (receipt.status === 'sending' || receipt.status === 'uncertain') {
    throw new WelcomeEmailError('welcome_delivery_needs_reconciliation');
  }
  const headers = { Authorization: `Bearer ${env.HUBSPOT_TOKEN}`, 'Content-Type': 'application/json' };
  const contactUrl = `${CONTACTS}${encodeURIComponent(email)}?idProperty=email`;
  let sentAt = receipt.sent_at;
  if (!sentAt) {
    const lookup = await fetcher(`${contactUrl}&properties=${DATE_PROPERTY}`, {
      headers, signal: AbortSignal.timeout(5_000),
    });
    if (!lookup.ok) {
      await lookup.body?.cancel();
      throw new WelcomeEmailError(`welcome_lookup_http_${lookup.status}`);
    }
    let priorDate: unknown;
    try {
      const contact = await lookup.json() as { properties?: Record<string, unknown> };
      priorDate = contact.properties?.[DATE_PROPERTY];
    } catch { throw new WelcomeEmailError('welcome_lookup_invalid'); }
    // Test mode deliberately sends one canary even when this test contact was welcomed before.
    if (priorDate && env.WELCOME_EMAIL_MODE !== 'test') {
      await env.DB.prepare(`UPDATE welcome_email_deliveries SET status = 'tracked', tracked_at = ?,
        updated_at = ? WHERE email_hash = ? AND environment = ? AND status = 'pending'`)
        .bind(timestamp, timestamp, key, environment).run();
      return;
    }
    const claim = await env.DB.prepare(`UPDATE welcome_email_deliveries SET status = 'sending',
      updated_at = ? WHERE email_hash = ? AND environment = ? AND status = 'pending'`)
      .bind(timestamp, key, environment).run();
    if (!claim.meta.changes) throw new WelcomeEmailError('welcome_delivery_in_progress');
    try {
      await env.WELCOME_EMAIL.send({
        from: env.WELCOME_EMAIL_FROM, to: email, replyTo: 'info@owasp-oasis.org',
        subject: WELCOME_EMAIL_SUBJECT, html: WELCOME_EMAIL_HTML, text: WELCOME_EMAIL_TEXT,
      });
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error
        && typeof error.code === 'string' && /^E_[A-Z0-9_]+$/.test(error.code) ? error.code : 'unknown';
      // Explicit rejections can retry. Unknown transport outcomes require reconciliation.
      const retryable = code !== 'unknown' && code !== 'E_INTERNAL_SERVER_ERROR';
      await env.DB.prepare(`UPDATE welcome_email_deliveries SET status = ?, last_error = ?,
        updated_at = ? WHERE email_hash = ? AND environment = ?`)
        .bind(retryable ? 'pending' : 'uncertain', code, timestamp, key, environment).run();
      throw new WelcomeEmailError(`welcome_send_${code}`);
    }
    sentAt = timestamp;
    await env.DB.prepare(`UPDATE welcome_email_deliveries SET status = 'sent', sent_at = ?,
      last_error = NULL, updated_at = ? WHERE email_hash = ? AND environment = ?`)
      .bind(sentAt, timestamp, key, environment).run();
    console.log(JSON.stringify({ event: 'welcome_email_sent' }));
  }
  const tracking = await fetcher(contactUrl, {
    method: 'PATCH', headers, signal: AbortSignal.timeout(5_000),
    body: JSON.stringify({ properties: { [DATE_PROPERTY]: sendDate(sentAt) } }),
  });
  await tracking.body?.cancel();
  if (!tracking.ok) throw new WelcomeEmailError(`welcome_tracking_http_${tracking.status}`);
  await env.DB.prepare(`UPDATE welcome_email_deliveries SET status = 'tracked', tracked_at = ?,
    last_error = NULL, updated_at = ? WHERE email_hash = ? AND environment = ?`)
    .bind(timestamp, timestamp, key, environment).run();
  console.log(JSON.stringify({ event: 'welcome_email_tracked' }));
}
