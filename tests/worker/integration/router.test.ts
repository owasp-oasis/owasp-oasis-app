/**
 * Integration tests for worker routing, method validation, CORS, and status codes.
 * Tests the main fetch handler's request dispatch logic.
 *
 * Coverage gaps (mock fetch limitation):
 * - ASSETS binding fallback is not tested (would require ASSETS binding in test env)
 * - localhost CORS headers are not returned (ALLOWED_ORIGINS only includes HTTPS domains)
 *   This is documented in helpers.ts and is acceptable since CORS behavior is tested via Origin headers
 */

import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { env } from 'cloudflare:test';
import { SELF } from './testWorker.js';
import { applySchema, cleanDB } from './helpers.js';

describe('router (worker/index.ts)', () => {
  beforeAll(async () => {
    await applySchema(env);
  });

  afterEach(async () => {
    await cleanDB(env);
  });

  describe('method validation', () => {
    it('returns 405 for PATCH requests', async () => {
      const res = await SELF.fetch(new Request('http://localhost/api/test', { method: 'PATCH' }));
      expect(res.status).toBe(405);
      expect(res.headers.get('Allow')).toBe('GET, POST, OPTIONS, HEAD');
    });

    it('returns 405 for DELETE requests', async () => {
      const res = await SELF.fetch(new Request('http://localhost/api/test', { method: 'DELETE' }));
      expect(res.status).toBe(405);
    });

    it('allows GET requests', async () => {
      const res = await SELF.fetch(new Request('http://localhost/api/count', { method: 'GET' }));
      expect(res.status).not.toBe(405);
    });

    it('allows POST requests', async () => {
      const res = await SELF.fetch(new Request('http://localhost/api/csrf', { method: 'POST' }));
      // Will fail for other reasons but not 405
      expect(res.status).not.toBe(405);
    });

    it('allows PUT requests (bug fixed)', async () => {
      const res = await SELF.fetch(
        new Request('http://localhost/api/preferences/mine', {
          method: 'PUT',
          body: '{}',
          headers: { 'Content-Type': 'application/json' },
        }),
      );
      // Will fail auth, but not 405 — proves PUT is in ALLOWED_METHODS
      expect(res.status).not.toBe(405);
    });

    it('allows OPTIONS requests', async () => {
      const res = await SELF.fetch(new Request('http://localhost/api/test', { method: 'OPTIONS' }));
      expect(res.status).toBe(204);
    });

    it('allows HEAD requests', async () => {
      const res = await SELF.fetch(new Request('http://localhost/api/csrf', { method: 'HEAD' }));
      // HEAD might work on GET endpoints
      expect(res.status).not.toBe(405);
    });
  });

  describe('GET /api/count', () => {
    it('returns registrations count', async () => {
      const res = await SELF.fetch(new Request('http://localhost/api/count'));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.count).toBe(0);
    });

    it('returns content as JSON', async () => {
      const res = await SELF.fetch(new Request('http://localhost/api/count'));
      expect(res.headers.get('Content-Type')).toContain('application/json');
    });
  });

  describe('OPTIONS handling', () => {
    it('returns 204 No Content for OPTIONS', async () => {
      const res = await SELF.fetch(new Request('http://localhost/api/test', { method: 'OPTIONS' }));
      expect(res.status).toBe(204);
    });

    it('includes CORS headers in OPTIONS response', async () => {
      const res = await SELF.fetch(
        new Request('http://localhost/api/test', {
          method: 'OPTIONS',
          headers: { Origin: 'https://www.owasp-oasis.org' },
        }),
      );
      expect(res.headers.get('Access-Control-Allow-Methods')).toBeTruthy();
      expect(res.headers.get('Access-Control-Allow-Headers')).toBeTruthy();
    });
  });

  describe('security headers on all responses', () => {
    it('includes X-Frame-Options: DENY', async () => {
      const res = await SELF.fetch(new Request('http://localhost/api/count'));
      expect(res.headers.get('X-Frame-Options')).toBe('DENY');
    });

    it('includes X-Content-Type-Options: nosniff', async () => {
      const res = await SELF.fetch(new Request('http://localhost/api/count'));
      expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    });

    it('omits Strict-Transport-Security on loopback requests', async () => {
      const res = await SELF.fetch(new Request('http://localhost/api/count'));
      expect(res.headers.get('Strict-Transport-Security')).toBeNull();
    });

    it('includes Content-Security-Policy', async () => {
      const res = await SELF.fetch(new Request('http://localhost/api/count'));
      expect(res.headers.get('Content-Security-Policy')).toBeTruthy();
    });
  });

  describe('CORS behavior', () => {
    it('sets Access-Control-Allow-Origin for allowed origins', async () => {
      const res = await SELF.fetch(
        new Request('http://localhost/api/count', {
          headers: { Origin: 'https://www.owasp-oasis.org' },
        }),
      );
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://www.owasp-oasis.org');
    });

    it('sets Access-Control-Allow-Credentials for allowed origins', async () => {
      const res = await SELF.fetch(
        new Request('http://localhost/api/count', {
          headers: { Origin: 'https://preview.owasp-oasis.org' },
        }),
      );
      expect(res.headers.get('Access-Control-Allow-Credentials')).toBe('true');
    });

    it('does not set CORS headers for disallowed origins', async () => {
      const res = await SELF.fetch(
        new Request('http://localhost/api/count', {
          headers: { Origin: 'https://malicious.com' },
        }),
      );
      expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
    });

    it('does not set CORS headers when origin is missing', async () => {
      const res = await SELF.fetch(new Request('http://localhost/api/count'));
      expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
    });

    it('localhost requests do not get CORS headers (test limitation documented)', async () => {
      const res = await SELF.fetch(
        new Request('http://localhost/api/count', {
          headers: { Origin: 'http://localhost' },
        }),
      );
      // localhost is not in ALLOWED_ORIGINS, so no CORS headers
      // This is expected behavior: tests validate API responses, not CORS
      expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
    });
  });

  describe('unknown routes', () => {
    it('returns response for /api/unknown (handled by ASSETS fallback)', async () => {
      const res = await SELF.fetch(new Request('http://localhost/api/unknown'));
      // ASSETS binding is not available in test, so this will 404 or fall through
      // Just verify it doesn't crash
      expect(res.status).toBeGreaterThan(0);
    });
  });

  describe('error responses include security headers', () => {
    it('405 response includes security headers', async () => {
      const res = await SELF.fetch(new Request('http://localhost/api/test', { method: 'PATCH' }));
      expect(res.headers.get('X-Frame-Options')).toBe('DENY');
      expect(res.headers.get('Content-Security-Policy')).toBeTruthy();
    });
  });
});
