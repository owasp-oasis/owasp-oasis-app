/**
 * Integration tests for user preferences endpoints.
 * Tests GET /api/preferences/mine and PUT /api/preferences/mine
 * Also confirms that PUT method bug is fixed (PUT was missing from ALLOWED_METHODS).
 */

import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { env } from 'cloudflare:test';
import { applySchema, cleanDB, createTestSession } from './helpers.js';

// Constant for tests
const CURRENT_ONBOARDING_VERSION = '2026.07.005';

describe('GET /api/preferences/mine and PUT /api/preferences/mine', () => {
  beforeAll(async () => {
    await applySchema(env);
  });

  afterEach(async () => {
    await cleanDB(env);
  });

  describe('GET /api/preferences/mine', () => {
    it('returns 401 when unauthenticated', async () => {
      const res = await env.SELF.fetch(new Request('http://localhost/api/preferences/mine'));
      expect(res.status).toBe(401);
    });

    it('returns default preferences for new user', async () => {
      const { sessionCookie, tokenCookie } = await createTestSession(env);

      const res = await env.SELF.fetch(
        new Request('http://localhost/api/preferences/mine', {
          headers: { Cookie: `${sessionCookie}; ${tokenCookie}` },
        }),
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.preferences.languages).toBeNull();
      expect(body.preferences.severities).toBeNull();
      expect(body.preferences.experience).toBeNull();
      expect(body.preferences.onboarding_version).toBeNull();
      expect(body.current_version).toBe(CURRENT_ONBOARDING_VERSION);
    });

    it('returns saved preferences', async () => {
      const { sessionCookie, tokenCookie, login } = await createTestSession(env);

      // Save preferences
      await env.DB.prepare(`
        INSERT INTO user_preferences
        (github_login, languages, severities, experience, onboarding_version, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
        .bind(
          login,
          JSON.stringify(['Python', 'Go']),
          JSON.stringify(['high', 'critical']),
          'new',
          '2026.07.005',
          new Date().toISOString(),
          new Date().toISOString(),
        )
        .run();

      const res = await env.SELF.fetch(
        new Request('http://localhost/api/preferences/mine', {
          headers: { Cookie: `${sessionCookie}; ${tokenCookie}` },
        }),
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.preferences.languages).toEqual(['Python', 'Go']);
      expect(body.preferences.severities).toEqual(['high', 'critical']);
      expect(body.preferences.experience).toBe('new');
      expect(body.preferences.onboarding_version).toBe('2026.07.005');
    });
  });

  describe('PUT /api/preferences/mine', () => {
    it('returns 401 when unauthenticated', async () => {
      const res = await env.SELF.fetch(
        new Request('http://localhost/api/preferences/mine', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ languages: ['Python'] }),
        }),
      );

      expect(res.status).toBe(401);
    });

    it('saves languages and severities', async () => {
      const { sessionCookie, tokenCookie, login } = await createTestSession(env);

      const res = await env.SELF.fetch(
        new Request('http://localhost/api/preferences/mine', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Cookie: `${sessionCookie}; ${tokenCookie}`,
          },
          body: JSON.stringify({
            languages: ['Python', 'Go'],
            severities: ['high', 'critical'],
            experience: 'new',
          }),
        }),
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.preferences.languages).toEqual(['Python', 'Go']);
      expect(body.preferences.severities).toEqual(['high', 'critical']);
    });

    it('updates onboarding_version', async () => {
      const { sessionCookie, tokenCookie } = await createTestSession(env);

      const res = await env.SELF.fetch(
        new Request('http://localhost/api/preferences/mine', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Cookie: `${sessionCookie}; ${tokenCookie}`,
          },
          body: JSON.stringify({
            onboarding_version: '2026.07.005',
          }),
        }),
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.preferences.onboarding_version).toBe('2026.07.005');
    });

    it('preserves created_at on update', async () => {
      const { sessionCookie, tokenCookie, login } = await createTestSession(env);
      const now = new Date().toISOString();
      const later = new Date(Date.now() + 1000).toISOString();

      // Initial insert
      await env.DB.prepare(`
        INSERT INTO user_preferences
        (github_login, languages, severities, experience, onboarding_version, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
        .bind(login, null, null, null, null, now, now)
        .run();

      // Update preferences
      await env.SELF.fetch(
        new Request('http://localhost/api/preferences/mine', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Cookie: `${sessionCookie}; ${tokenCookie}`,
          },
          body: JSON.stringify({
            languages: ['Rust'],
          }),
        }),
      );

      // Check created_at is preserved
      const row = await env.DB.prepare('SELECT created_at FROM user_preferences WHERE github_login = ?')
        .bind(login)
        .first();

      expect((row as any).created_at).toBe(now);
    });

    it('allows partial updates', async () => {
      const { sessionCookie, tokenCookie, login } = await createTestSession(env);

      // Set initial preferences
      await env.DB.prepare(`
        INSERT INTO user_preferences
        (github_login, languages, severities, experience, onboarding_version, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
        .bind(
          login,
          JSON.stringify(['Python']),
          JSON.stringify(['high']),
          'experienced',
          '2026.06.001',
          new Date().toISOString(),
          new Date().toISOString(),
        )
        .run();

      // Update only languages
      const res = await env.SELF.fetch(
        new Request('http://localhost/api/preferences/mine', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Cookie: `${sessionCookie}; ${tokenCookie}`,
          },
          body: JSON.stringify({
            languages: ['Go', 'Rust'],
          }),
        }),
      );

      expect(res.status).toBe(200);

      // Verify other fields remain
      const row = await env.DB.prepare('SELECT * FROM user_preferences WHERE github_login = ?')
        .bind(login)
        .first();

      expect(JSON.parse((row as any).languages)).toEqual(['Go', 'Rust']);
      expect(JSON.parse((row as any).severities)).toEqual(['high']); // Unchanged
      expect((row as any).experience).toBe('experienced'); // Unchanged
    });

    it('rejects invalid JSON', async () => {
      const { sessionCookie, tokenCookie } = await createTestSession(env);

      const res = await env.SELF.fetch(
        new Request('http://localhost/api/preferences/mine', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Cookie: `${sessionCookie}; ${tokenCookie}`,
          },
          body: '{invalid}',
        }),
      );

      expect(res.status).toBe(400);
    });

    it('PUT method is now allowed (bug fix confirmed)', async () => {
      // This test specifically confirms the PUT method bug is fixed
      // Previously, PUT was not in ALLOWED_METHODS and would return 405
      // Now it should reach the handler (may fail auth, but not 405)
      const { sessionCookie, tokenCookie } = await createTestSession(env);

      const res = await env.SELF.fetch(
        new Request('http://localhost/api/preferences/mine', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Cookie: `${sessionCookie}; ${tokenCookie}`,
          },
          body: JSON.stringify({ languages: ['Python'] }),
        }),
      );

      // Should be 200, not 405
      expect(res.status).not.toBe(405);
      expect(res.status).toBe(200);
    });

    it('supports empty arrays for languages/severities', async () => {
      const { sessionCookie, tokenCookie } = await createTestSession(env);

      const res = await env.SELF.fetch(
        new Request('http://localhost/api/preferences/mine', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Cookie: `${sessionCookie}; ${tokenCookie}`,
          },
          body: JSON.stringify({
            languages: [],
            severities: [],
          }),
        }),
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.preferences.languages).toEqual([]);
      expect(body.preferences.severities).toEqual([]);
    });

    it('supports null values to clear preferences', async () => {
      const { sessionCookie, tokenCookie, login } = await createTestSession(env);

      // Set initial preferences
      await env.DB.prepare(`
        INSERT INTO user_preferences
        (github_login, languages, severities, experience, onboarding_version, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
        .bind(
          login,
          JSON.stringify(['Python']),
          JSON.stringify(['high']),
          'new',
          '2026.06.001',
          new Date().toISOString(),
          new Date().toISOString(),
        )
        .run();

      // Clear languages
      const res = await env.SELF.fetch(
        new Request('http://localhost/api/preferences/mine', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Cookie: `${sessionCookie}; ${tokenCookie}`,
          },
          body: JSON.stringify({
            languages: null,
          }),
        }),
      );

      expect(res.status).toBe(200);

      // Verify languages is null
      const row = await env.DB.prepare('SELECT languages FROM user_preferences WHERE github_login = ?')
        .bind(login)
        .first();

      expect((row as any).languages).toBeNull();
    });
  });
});
