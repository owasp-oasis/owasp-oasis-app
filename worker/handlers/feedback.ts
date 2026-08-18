/**
 * POST /api/feedback — creates a GitHub issue for preview site feedback.
 */

import type { Env } from '../types.js';
import { validateCSRF, checkRateLimit, jsonOk, jsonErr } from '../security.js';
import { parseBody } from '../validation.js';

const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const CREDENTIAL_PATTERN = /(?:github_pat_|gh[pousr]_|AKIA)[A-Z0-9_]{16,}|-----BEGIN [A-Z ]*PRIVATE KEY-----/i;

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
  if (EMAIL_PATTERN.test(description) || CREDENTIAL_PATTERN.test(description)) {
    return jsonErr('Remove email addresses, credentials, and other private information before submitting.', 400, request);
  }

  const VALID_SEVERITY = new Set(['bug', 'suggestion', 'other']);
  const severity = VALID_SEVERITY.has(String(body['severity'])) ? String(body['severity']) : 'other';

  const token = env.GITHUB_TOKEN;
  if (!token) {
    console.error('handleFeedback: GITHUB_TOKEN not set');
    return jsonErr('Feedback service unavailable.', 503, request);
  }

  const severityLabel = severity === 'bug' ? '[Bug]' : severity === 'suggestion' ? '[Suggestion]' : '[Feedback]';
  const issueTitle    = `${severityLabel} Preview site feedback`;
  const issueBody = [
    `**Type:** ${severity}`,
    '',
    '**Description:**',
    description,
    '',
    '---',
    `_Submitted via preview site feedback form on ${new Date().toUTCString()}_`,
  ].join('\n');

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
