/**
 * POST /api/feedback — creates a GitHub issue for preview site feedback.
 */

import type { Env } from '../types.js';
import { validateCSRF, checkRateLimit, jsonOk, jsonErr } from '../security.js';
import { parseBody, vGitHub } from '../validation.js';

const CREDENTIAL_PATTERN = /(?:github_pat_|gh[pousr]_|AKIA)[A-Z0-9_]{16,}|-----BEGIN [A-Z ]*PRIVATE KEY-----/i;

export function containsCredentialLikeSecret(value: string): boolean {
  return CREDENTIAL_PATTERN.test(value);
}

export type ReporterLookupResult =
  | { ok: true; login: string }
  | { ok: false; reason: 'not_found' | 'upstream' };

export async function verifyGitHubReporter(
  username: string,
  token: string,
  fetcher: typeof fetch = fetch,
): Promise<ReporterLookupResult> {
  const response = await fetcher(`https://api.github.com/users/${encodeURIComponent(username)}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'owasp-oasis-worker/1.0',
    },
  });

  if (response.status === 404) return { ok: false, reason: 'not_found' };
  if (!response.ok) return { ok: false, reason: 'upstream' };

  const profile: unknown = await response.json();
  const login = typeof profile === 'object' && profile !== null && 'login' in profile
    ? String(profile.login)
    : '';
  const validated = vGitHub(login);
  if (!validated.ok || !validated.val) return { ok: false, reason: 'upstream' };
  return { ok: true, login: validated.val };
}

export function buildFeedbackIssueBody(
  severity: string,
  description: string,
  reporter: string | null,
  submittedAt = new Date(),
): string {
  return [
    `**Type:** ${severity}`,
    reporter ? `**Reporter:** @${reporter}` : null,
    '',
    '**Description:**',
    description,
    '',
    '---',
    `_Submitted via preview site feedback form on ${submittedAt.toUTCString()}_`,
  ].filter((line): line is string => line !== null).join('\n');
}

export async function handleFeedback(request: Request, env: Env): Promise<Response> {
  if (!validateCSRF(request)) return jsonErr('Invalid or missing security token', 403, request);

  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  const rl = await checkRateLimit(env, ip);
  if (!rl.allowed) return jsonErr('Too many requests — please wait a minute and try again.', 429, request);

  const parsed = await parseBody(request);
  if (!parsed.ok) return jsonErr(parsed.error, 400, request);
  const body = parsed.val;

  const description = String(body['description'] ?? '').trim();
  if (!description || description.length < 10) {
    return jsonErr('Description must be at least 10 characters.', 400, request);
  }
  if (description.length > 5000) {
    return jsonErr('Description must be 5000 characters or fewer.', 400, request);
  }
  if (containsCredentialLikeSecret(description)) {
    return jsonErr('Remove credentials and other private secrets before submitting.', 400, request);
  }

  const VALID_SEVERITY = new Set(['bug', 'suggestion', 'other']);
  const severity = VALID_SEVERITY.has(String(body['severity'])) ? String(body['severity']) : 'other';

  const reporterValidation = vGitHub(body['github_username'] ?? '');
  if (!reporterValidation.ok) return jsonErr(reporterValidation.error, 400, request);

  const token = env.GITHUB_TOKEN;
  if (!token) {
    console.error('handleFeedback: GITHUB_TOKEN not set');
    return jsonErr('Feedback service unavailable.', 503, request);
  }

  let reporter: string | null = null;
  if (reporterValidation.val) {
    try {
      const lookup = await verifyGitHubReporter(reporterValidation.val, token);
      if (!lookup.ok) {
        if (lookup.reason === 'not_found') return jsonErr('GitHub username not found.', 400, request);
        console.warn('GitHub reporter lookup failed');
        return jsonErr('Unable to verify GitHub username. Please try again.', 502, request);
      }
      reporter = lookup.login;
    } catch (err) {
      console.warn('GitHub reporter lookup failed:', (err as Error)?.message);
      return jsonErr('Unable to verify GitHub username. Please try again.', 502, request);
    }
  }

  const severityLabel = severity === 'bug' ? '[Bug]' : severity === 'suggestion' ? '[Suggestion]' : '[Feedback]';
  const issueTitle    = `${severityLabel} Preview site feedback`;
  const issueBody = buildFeedbackIssueBody(severity, description, reporter);

  const ghRes = await fetch('https://api.github.com/repos/owasp-oasis/owasp-oasis-app/issues', {
    method: 'POST',
    headers: {
      'Authorization':       `Bearer ${token}`,
      'Accept':              'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type':        'application/json',
      'User-Agent':          'owasp-oasis-worker/1.0',
    },
    body: JSON.stringify({ title: issueTitle, body: issueBody, labels: ['preview-feedback'] }),
  });

  if (!ghRes.ok) {
    const errText = await ghRes.text().catch(() => '');
    console.error('GitHub issue creation failed:', ghRes.status, errText);
    return jsonErr('Failed to submit feedback. Please try again.', 502, request);
  }

  return jsonOk({ message: 'Feedback submitted. Thank you!' }, request);
}
