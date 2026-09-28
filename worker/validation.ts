/**
 * Input validation, sanitization, and body parsing utilities.
 */

/* ─── PATTERNS & LIMITS ──────────────────────────────────────── */
const EMAIL_RE = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
const GH_RE    = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,38}$/;
const MAX      = { email: 254, name: 100, github: 39, org: 120, why: 1000 };
const MAX_BODY_BYTES = 8_192;

const ALLOWED_ROLES = new Set(['validator', 'sponsor', 'general', '']);

/* ─── SANITIZE ───────────────────────────────────────────────── */
export function sanitize(val: unknown): string {
  if (val === null || val === undefined) return '';
  if (typeof val !== 'string') return '';
  return val.replace(/<[^>]*>/g, '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').trim();
}

/* ─── VALIDATORS ─────────────────────────────────────────────── */
type OK<T>  = { ok: true;  val: T };
type Err    = { ok: false; error: string; status?: number };
type Result<T> = OK<T> | Err;

export function vEmail(val: unknown): Result<string> {
  const v = sanitize(val).toLowerCase();
  if (!v) return { ok: false, error: 'Email is required' };
  if (v.length > MAX.email) return { ok: false, error: 'Email address is too long' };
  if (!EMAIL_RE.test(v)) return { ok: false, error: 'Please enter a valid email address' };
  const domain = v.split('@')[1].toLowerCase();
  const blocked = ['test.com', 'example.com', 'mailinator.com', 'guerrillamail.com', 'tempmail.com', 'throwam.com'];
  if (blocked.includes(domain)) return { ok: false, error: 'Please use a real email address' };
  return { ok: true, val: v };
}

export function vName(val: unknown): Result<string> {
  const v = sanitize(val);
  if (!v) return { ok: false, error: 'Name is required' };
  if (v.length < 2) return { ok: false, error: 'Name must be at least 2 characters' };
  if (v.length > MAX.name) return { ok: false, error: 'Name is too long' };
  return { ok: true, val: v };
}

export function vGitHub(val: unknown): Result<string> {
  const v = sanitize(val).replace(/^@/, '');
  if (!v) return { ok: true, val: '' };
  if (v.length > MAX.github) return { ok: false, error: 'GitHub username is too long (max 39 chars)' };
  if (v.startsWith('-')) return { ok: false, error: 'GitHub username cannot start with a hyphen' };
  if (!GH_RE.test(v)) return { ok: false, error: 'Invalid GitHub username format' };
  return { ok: true, val: v };
}

/** Validates syntax, then confirms that a non-empty public GitHub account exists. */
export async function vGitHubAccount(val: unknown, token: string): Promise<Result<string>> {
  const syntax = vGitHub(val);
  if (!syntax.ok || !syntax.val) return syntax;

  let response: Response;
  try {
    response = await fetch(`https://api.github.com/users/${encodeURIComponent(syntax.val)}`, {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'oasis-worker-registration/1.0',
      },
      signal: AbortSignal.timeout(5_000),
    });
  } catch {
    console.error(JSON.stringify({ event: 'github_account_verification_failed', reason: 'request_error' }));
    return {
      ok: false,
      error: 'Could not verify GitHub account right now — please try again.',
      status: 503,
    };
  }

  if (response.status === 404) {
    return { ok: false, error: 'GitHub account not found', status: 400 };
  }
  if (!response.ok) {
    console.error(JSON.stringify({
      event: 'github_account_verification_failed',
      reason: 'github_response',
      status: response.status,
    }));
    return {
      ok: false,
      error: 'Could not verify GitHub account right now — please try again.',
      status: 503,
    };
  }

  let account: unknown;
  try {
    account = await response.json();
  } catch {
    console.error(JSON.stringify({ event: 'github_account_verification_failed', reason: 'invalid_response' }));
    return {
      ok: false,
      error: 'Could not verify GitHub account right now — please try again.',
      status: 503,
    };
  }

  if (
    typeof account !== 'object'
    || account === null
    || !('login' in account)
    || typeof account.login !== 'string'
  ) {
    console.error(JSON.stringify({ event: 'github_account_verification_failed', reason: 'invalid_response' }));
    return {
      ok: false,
      error: 'Could not verify GitHub account right now — please try again.',
      status: 503,
    };
  }

  return syntax;
}

export function vText(val: unknown, max: number, fieldName = 'Field'): Result<string> {
  const v = sanitize(val);
  if (v.length > max) return { ok: false, error: `${fieldName} is too long (max ${max} chars)` };
  return { ok: true, val: v };
}

export function vRole(val: unknown): Result<string> {
  const v = sanitize(val);
  if (!ALLOWED_ROLES.has(v)) return { ok: false, error: 'Invalid role' };
  return { ok: true, val: v };
}

/* ─── BODY PARSER ────────────────────────────────────────────── */
export async function parseBody(request: Request): Promise<Result<Record<string, unknown>>> {
  const ct = request.headers.get('Content-Type') ?? '';
  if (!ct.includes('application/json')) return { ok: false, error: 'Content-Type must be application/json' };
  const contentLength = parseInt(request.headers.get('Content-Length') ?? '0', 10);
  if (contentLength > MAX_BODY_BYTES) return { ok: false, error: 'Request body too large' };
  let body: unknown;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) return { ok: false, error: 'Request body too large' };
    body = JSON.parse(text);
  } catch {
    return { ok: false, error: 'Invalid JSON in request body' };
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { ok: false, error: 'Request body must be a JSON object' };
  }
  return { ok: true, val: body as Record<string, unknown> };
}

/* ─── HASH HELPER ────────────────────────────────────────────── */
export async function hashString(str: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('');
}
