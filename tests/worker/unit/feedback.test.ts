import { describe, expect, it } from 'vitest';
import {
  buildFeedbackIssueBody,
  containsCredentialLikeSecret,
  verifyGitHubReporter,
} from '../../../worker/handlers/feedback.js';

describe('feedback reporter handling', () => {
  it('uses the canonical GitHub login after verification', async () => {
    const fetcher: typeof fetch = async () => Response.json({ login: 'OctoCat' });

    await expect(verifyGitHubReporter('octocat', 'test-token', fetcher)).resolves.toEqual({
      ok: true,
      login: 'OctoCat',
    });
  });

  it('distinguishes a missing account from an upstream failure', async () => {
    const missing: typeof fetch = async () => new Response(null, { status: 404 });
    const unavailable: typeof fetch = async () => new Response(null, { status: 503 });

    await expect(verifyGitHubReporter('missing', 'test-token', missing)).resolves.toEqual({
      ok: false,
      reason: 'not_found',
    });
    await expect(verifyGitHubReporter('octocat', 'test-token', unavailable)).resolves.toEqual({
      ok: false,
      reason: 'upstream',
    });
  });

  it('mentions a verified reporter in the public issue body', () => {
    const body = buildFeedbackIssueBody(
      'bug',
      'The project filter does not update.',
      'OctoCat',
      new Date('2026-08-18T20:00:00Z'),
    );

    expect(body).toContain('**Reporter:** @OctoCat');
    expect(body).toContain('The project filter does not update.');
  });

  it('omits the reporter line when no username is supplied', () => {
    const body = buildFeedbackIssueBody(
      'suggestion',
      'Please add keyboard navigation.',
      null,
      new Date('2026-08-18T20:00:00Z'),
    );

    expect(body).not.toContain('**Reporter:**');
  });

  it('allows email addresses while rejecting recognizable credential shapes', () => {
    expect(containsCredentialLikeSecret('Contact me at reporter@example.org')).toBe(false);
    const tokenFixture = ['token: ghp', '1234567890abcdefghijkl'].join('_');
    expect(containsCredentialLikeSecret(tokenFixture)).toBe(true);
    expect(containsCredentialLikeSecret('-----BEGIN PRIVATE KEY-----')).toBe(true);
  });
});
