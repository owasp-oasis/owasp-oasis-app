/**
 * Integration tests for POST /api/register endpoint.
 *
 * Coverage gaps:
 * - Real email deliverability (no actual email is sent)
 * - Live GitHub account responses (the API is mocked)
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { env } from 'cloudflare:test';
import { SELF } from './testWorker.js';
import { applySchema, cleanDB, makeCsrf, buildCookieHeader } from './helpers.js';
import { fetchMock } from './fetchMock.js';

describe('POST /api/register', () => {
  beforeAll(async () => {
    await applySchema(env);
  });

  beforeEach(() => {
    fetchMock.activate();
    fetchMock.disableNetConnect();
    fetchMock
      .when(req => req.method === 'GET' && req.url.startsWith('https://api.github.com/users/'))
      .respondWith(new Response(
        JSON.stringify({ login: 'verified-user', type: 'User' }),
        { headers: { 'Content-Type': 'application/json' } },
      ));
  });

  afterEach(async () => {
    fetchMock.deactivate();
    await cleanDB(env);
  });

  async function register(body: Record<string, unknown>, csrf: string) {
    const cookie = `__csrf=${csrf}`;
    return await SELF.fetch(
      new Request('http://localhost/api/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrf,
          Cookie: cookie,
        },
        body: JSON.stringify({ name: 'Test User', ...body }),
      }),
    );
  }

  describe('valid registration', () => {
    it('accepts valid registration', async () => {
      const csrf = makeCsrf();
      const res = await register(
        {
          name: 'John Doe',
          email: 'john@oasis-test.internal',
          github: 'johndoe',
          role: 'validator',
        },
        csrf,
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.message).toContain('successfully');

      const queued = await env.DB.prepare(
        'SELECT source_type, source_key, payload_json, status FROM hubspot_sync_queue WHERE source_key = ?',
      ).bind('john@oasis-test.internal').first<{
        source_type: string;
        source_key: string;
        payload_json: string;
        status: string;
      }>();
      expect(queued).toMatchObject({
        source_type: 'registration',
        source_key: 'john@oasis-test.internal',
        status: 'pending',
      });
      expect(JSON.parse(queued?.payload_json ?? '{}')).toMatchObject({
        source: 'registration',
        name: 'John Doe',
        email: 'john@oasis-test.internal',
        github: 'johndoe',
        role: 'validator',
      });
    });

    it('allows optional github field', async () => {
      fetchMock.deactivate();
      fetchMock.activate();
      fetchMock.disableNetConnect();

      const csrf = makeCsrf();
      const res = await register(
        {
          email: 'test@oasis-test.internal',
          role: 'sponsor',
        },
        csrf,
      );

      expect(res.status).toBe(200);
    });

    it('requires a submitted name instead of deriving one from email', async () => {
      const csrf = makeCsrf();
      const res = await register(
        {
          name: '',
          email: 'jane@oasis-test.internal',
          role: 'validator',
        },
        csrf,
      );

      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ ok: false, error: 'Name is required' });
    });
  });

  describe('email validation', () => {
    it('rejects invalid email format', async () => {
      const csrf = makeCsrf();
      const res = await register(
        {
          email: 'not-an-email',
          role: 'validator',
        },
        csrf,
      );

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.ok).toBe(false);
    });

    it('rejects blocked email domains', async () => {
      const csrf = makeCsrf();
      const res = await register(
        {
          email: 'user@mailinator.com',
          role: 'validator',
        },
        csrf,
      );

      expect(res.status).toBe(400);
    });

    it('rejects duplicate email', async () => {
      const csrf1 = makeCsrf();
      const csrf2 = makeCsrf();

      // First registration
      const res1 = await register(
        {
          email: 'duplicate@oasis-test.internal',
          role: 'validator',
        },
        csrf1,
      );
      expect(res1.status).toBe(200);

      // Second registration with same email
      const res2 = await register(
        {
          email: 'duplicate@oasis-test.internal',
          role: 'sponsor',
        },
        csrf2,
      );

      expect(res2.status).toBe(200);
      const body = await res2.json();
      expect(body.message).toContain('already registered');
    });

    it('rejects email exceeding max length', async () => {
      const csrf = makeCsrf();
      const longEmail = 'a'.repeat(250) + '@oasis-test.internal';

      const res = await register(
        {
          email: longEmail,
          role: 'validator',
        },
        csrf,
      );

      expect(res.status).toBe(400);
    });
  });

  describe('GitHub username validation', () => {
    it('accepts valid GitHub username', async () => {
      const csrf = makeCsrf();
      const res = await register(
        {
          email: 'test@oasis-test.internal',
          github: 'octocat',
          role: 'validator',
        },
        csrf,
      );

      expect(res.status).toBe(200);
    });

    it('strips @ prefix from GitHub username', async () => {
      const csrf = makeCsrf();
      const res = await register(
        {
          email: 'test1@oasis-test.internal',
          github: '@octocat',
          role: 'validator',
        },
        csrf,
      );

      expect(res.status).toBe(200);
    });

    it('rejects GitHub username with invalid characters', async () => {
      const csrf = makeCsrf();
      const res = await register(
        {
          email: 'test2@oasis-test.internal',
          github: 'user@name',
          role: 'validator',
        },
        csrf,
      );

      expect(res.status).toBe(400);
    });

    it('rejects GitHub username starting with hyphen', async () => {
      const csrf = makeCsrf();
      const res = await register(
        {
          email: 'test3@oasis-test.internal',
          github: '-user',
          role: 'validator',
        },
        csrf,
      );

      expect(res.status).toBe(400);
    });

    it('accepts a verified legacy GitHub username ending with a hyphen', async () => {
      const csrf = makeCsrf();
      const res = await register(
        {
          email: 'test4@oasis-test.internal',
          github: 'matt-',
          role: 'validator',
        },
        csrf,
      );

      expect(res.status).toBe(200);
      const registration = await env.DB.prepare(
        'SELECT github FROM registrations WHERE email = ?',
      ).bind('test4@oasis-test.internal').first<{ github: string }>();
      expect(registration?.github).toBe('matt-');
    });

    it('rejects a syntactically valid username that GitHub cannot find', async () => {
      fetchMock.deactivate();
      fetchMock.activate();
      fetchMock.disableNetConnect();
      fetchMock
        .when(req => req.method === 'GET' && req.url === 'https://api.github.com/users/not-a-real-oasis-user')
        .respondWith(new Response('Not Found', { status: 404 }));

      const csrf = makeCsrf();
      const res = await register(
        {
          email: 'missing-github@oasis-test.internal',
          github: 'not-a-real-oasis-user',
          role: 'validator',
        },
        csrf,
      );

      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ ok: false, error: 'GitHub account not found' });
      const registration = await env.DB.prepare(
        'SELECT COUNT(*) AS count FROM registrations WHERE email = ?',
      ).bind('missing-github@oasis-test.internal').first<{ count: number }>();
      expect(registration?.count).toBe(0);
    });

    it('returns a retryable error when GitHub verification is unavailable', async () => {
      fetchMock.deactivate();
      fetchMock.activate();
      fetchMock.disableNetConnect();
      fetchMock
        .when(req => req.method === 'GET' && req.url === 'https://api.github.com/users/octocat')
        .respondWith(new Response('Service Unavailable', { status: 503 }));

      const csrf = makeCsrf();
      const res = await register(
        {
          email: 'github-unavailable@oasis-test.internal',
          github: 'octocat',
          role: 'validator',
        },
        csrf,
      );

      expect(res.status).toBe(503);
      expect(await res.json()).toMatchObject({
        ok: false,
        error: 'Could not verify GitHub account right now — please try again.',
      });
    });
  });

  describe('role validation', () => {
    it('accepts valid roles', async () => {
      const csrf1 = makeCsrf();
      const csrf2 = makeCsrf();

      const res1 = await register(
        {
          email: 'validator@oasis-test.internal',
          role: 'validator',
        },
        csrf1,
      );
      expect(res1.status).toBe(200);

      const res2 = await register(
        {
          email: 'sponsor@oasis-test.internal',
          role: 'sponsor',
        },
        csrf2,
      );
      expect(res2.status).toBe(200);
    });

    it('rejects invalid role', async () => {
      const csrf = makeCsrf();
      const res = await register(
        {
          email: 'test@oasis-test.internal',
          role: 'admin',
        },
        csrf,
      );

      expect(res.status).toBe(400);
    });

    it('accepts empty role (defaults to empty string)', async () => {
      const csrf = makeCsrf();
      const res = await register(
        {
          email: 'norole@oasis-test.internal',
          role: '',
        },
        csrf,
      );

      expect(res.status).toBe(200);
    });
  });

  describe('CSRF protection', () => {
    it('rejects registration without CSRF token', async () => {
      const res = await SELF.fetch(
        new Request('http://localhost/api/register', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ email: 'test@oasis-test.internal' }),
        }),
      );

      expect(res.status).toBe(403);
    });

    it('rejects registration with mismatched CSRF token', async () => {
      const csrf1 = makeCsrf();
      const csrf2 = makeCsrf();

      const res = await SELF.fetch(
        new Request('http://localhost/api/register', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-csrf-token': csrf1,
            Cookie: `__csrf=${csrf2}`,
          },
          body: JSON.stringify({ email: 'test@oasis-test.internal' }),
        }),
      );

      expect(res.status).toBe(403);
    });
  });

  describe('rate limiting', () => {
    it('allows 5 requests per 60 seconds', async () => {
      const requests: Promise<Response>[] = [];

      for (let i = 0; i < 5; i++) {
        const csrf = makeCsrf();
        requests.push(
          register(
            {
              email: `user${i}@oasis-test.internal`,
              role: 'validator',
            },
            csrf,
          ),
        );
      }

      const responses = await Promise.all(requests);
      for (const res of responses) {
        expect(res.status).toBe(200);
      }
    });

    it('rejects 6th request with 429', async () => {
      // First 5 requests
      for (let i = 0; i < 5; i++) {
        const csrf = makeCsrf();
        await register(
          {
            email: `user${i}@oasis-test.internal`,
            role: 'validator',
          },
          csrf,
        );
      }

      // 6th request should be rate limited
      const csrf = makeCsrf();
      const res = await register(
        {
          email: 'user-blocked@oasis-test.internal',
          role: 'validator',
        },
        csrf,
      );

      expect(res.status).toBe(429);
    });
  });

  describe('name validation', () => {
    it('accepts names 2-100 characters', async () => {
      const csrf1 = makeCsrf();
      const csrf2 = makeCsrf();

      const res1 = await register(
        {
          name: 'AB',
          email: 'ab@oasis-test.internal',
          role: 'validator',
        },
        csrf1,
      );
      expect(res1.status).toBe(200);

      const name100 = 'A'.repeat(100);
      const res2 = await register(
        {
          name: name100,
          email: 'name100@oasis-test.internal',
          role: 'validator',
        },
        csrf2,
      );
      expect(res2.status).toBe(200);
    });

    it('rejects name shorter than 2 characters', async () => {
      const csrf = makeCsrf();
      const res = await register(
        {
          name: 'A',
          email: 'test@oasis-test.internal',
          role: 'validator',
        },
        csrf,
      );

      expect(res.status).toBe(400);
    });

    it('rejects name longer than 100 characters', async () => {
      const csrf = makeCsrf();
      const res = await register(
        {
          name: 'A'.repeat(101),
          email: 'test@oasis-test.internal',
          role: 'validator',
        },
        csrf,
      );

      expect(res.status).toBe(400);
    });
  });

  describe('request validation', () => {
    it('rejects wrong Content-Type', async () => {
      const csrf = makeCsrf();
      const res = await SELF.fetch(
        new Request('http://localhost/api/register', {
          method: 'POST',
          headers: {
            'Content-Type': 'text/plain',
            'x-csrf-token': csrf,
            Cookie: `__csrf=${csrf}`,
          },
          body: '{"email":"test@oasis-test.internal"}',
        }),
      );

      expect(res.status).toBe(400);
    });

    it('rejects malformed JSON', async () => {
      const csrf = makeCsrf();
      const res = await SELF.fetch(
        new Request('http://localhost/api/register', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-csrf-token': csrf,
            Cookie: `__csrf=${csrf}`,
          },
          body: '{invalid}',
        }),
      );

      expect(res.status).toBe(400);
    });

    it('rejects empty body', async () => {
      const csrf = makeCsrf();
      const res = await SELF.fetch(
        new Request('http://localhost/api/register', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-csrf-token': csrf,
            Cookie: `__csrf=${csrf}`,
          },
          body: '{}',
        }),
      );

      expect(res.status).toBe(400);
    });
  });
});
