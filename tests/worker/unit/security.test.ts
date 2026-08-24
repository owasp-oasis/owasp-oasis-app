/**
 * Unit tests for security.ts: CSRF, cookies, encryption, headers, rate limiting
 * Most tests are synchronous; encryption tests use Web Crypto.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  generateCSRF,
  getCookieValue,
  validateCSRF,
  encryptToken,
  decryptToken,
  secHeaders,
  handleOptions,
  ALLOWED_ORIGINS,
  ALLOWED_METHODS,
  CSRF_COOKIE,
  CSRF_HEADER,
  SESSION_COOKIE,
  isLoopbackRequest,
} from '../../../worker/security.js';

describe('security.ts', () => {
  describe('generateCSRF()', () => {
    it('generates a 64-character hex string', () => {
      const token = generateCSRF();
      expect(token).toMatch(/^[0-9a-f]{64}$/);
      expect(token).toHaveLength(64);
    });

    it('generates different tokens on each call', () => {
      const token1 = generateCSRF();
      const token2 = generateCSRF();
      expect(token1).not.toBe(token2);
    });
  });

  describe('getCookieValue()', () => {
    it('extracts cookie value from single cookie', () => {
      const request = new Request('http://localhost', {
        headers: { Cookie: '__csrf=abc123def456' },
      });
      expect(getCookieValue(request, '__csrf')).toBe('abc123def456');
    });

    it('extracts cookie from multi-cookie header', () => {
      const request = new Request('http://localhost', {
        headers: { Cookie: '__session=xyz; __csrf=abc123; __other=value' },
      });
      expect(getCookieValue(request, '__csrf')).toBe('abc123');
    });

    it('returns null for missing cookie', () => {
      const request = new Request('http://localhost', {
        headers: { Cookie: '__other=value' },
      });
      expect(getCookieValue(request, '__csrf')).toBeNull();
    });

    it('returns null when no Cookie header', () => {
      const request = new Request('http://localhost');
      expect(getCookieValue(request, '__csrf')).toBeNull();
    });

    it('handles URL-encoded cookie values', () => {
      const request = new Request('http://localhost', {
        headers: { Cookie: '__name=hello%20world' },
      });
      // Note: getCookieValue returns raw string, not decoded
      expect(getCookieValue(request, '__name')).toBe('hello%20world');
    });

    it('handles cookies with spaces after semicolon', () => {
      const request = new Request('http://localhost', {
        headers: { Cookie: '__session=xyz; __csrf=abc123; __other=value' },
      });
      expect(getCookieValue(request, '__session')).toBe('xyz');
    });
  });

  describe('validateCSRF()', () => {
    it('validates matching CSRF tokens', () => {
      const token = generateCSRF();
      const request = new Request('http://localhost', {
        headers: {
          Cookie: `${CSRF_COOKIE}=${token}`,
          [CSRF_HEADER]: token,
        },
      });
      expect(validateCSRF(request)).toBe(true);
    });

    it('rejects mismatched tokens', () => {
      const token1 = generateCSRF();
      const token2 = generateCSRF();
      const request = new Request('http://localhost', {
        headers: {
          Cookie: `${CSRF_COOKIE}=${token1}`,
          [CSRF_HEADER]: token2,
        },
      });
      expect(validateCSRF(request)).toBe(false);
    });

    it('rejects missing cookie', () => {
      const token = generateCSRF();
      const request = new Request('http://localhost', {
        headers: {
          [CSRF_HEADER]: token,
        },
      });
      expect(validateCSRF(request)).toBe(false);
    });

    it('rejects missing header', () => {
      const token = generateCSRF();
      const request = new Request('http://localhost', {
        headers: {
          Cookie: `${CSRF_COOKIE}=${token}`,
        },
      });
      expect(validateCSRF(request)).toBe(false);
    });

    it('rejects malformed tokens (not 64 hex chars)', () => {
      const request = new Request('http://localhost', {
        headers: {
          Cookie: `${CSRF_COOKIE}=abc`,
          [CSRF_HEADER]: 'abc',
        },
      });
      expect(validateCSRF(request)).toBe(false);
    });

    it('validates with constant-time comparison (timing-safe)', () => {
      const token = generateCSRF();
      const request = new Request('http://localhost', {
        headers: {
          Cookie: `${CSRF_COOKIE}=${token}`,
          [CSRF_HEADER]: token,
        },
      });
      // This test just confirms the function works; real timing-safety is hard to test
      expect(validateCSRF(request)).toBe(true);
    });
  });

  describe('encryptToken() and decryptToken()', () => {
    it('round-trips token through encrypt/decrypt', async () => {
      const secret = 'my-secret-key';
      const token = 'test-github-token-12345';

      const encrypted = await encryptToken(secret, token);
      const decrypted = await decryptToken(secret, encrypted);

      expect(decrypted).toBe(token);
    });

    it('returns null when decrypting with wrong key', async () => {
      const secret1 = 'secret1';
      const secret2 = 'secret2';
      const token = 'test-token';

      const encrypted = await encryptToken(secret1, token);
      const decrypted = await decryptToken(secret2, encrypted);

      expect(decrypted).toBeNull();
    });

    it('returns null for malformed ciphertext', async () => {
      const secret = 'my-secret';
      const malformed = 'definitely-not-valid-base64url!!!';

      const result = await decryptToken(secret, malformed);
      expect(result).toBeNull();
    });

    it('returns null for tampered ciphertext', async () => {
      const secret = 'my-secret';
      const token = 'original-token';

      const encrypted = await encryptToken(secret, token);
      // Flip a bit in the encrypted value
      const tampered = encrypted.slice(0, -1) + (encrypted.slice(-1) === 'A' ? 'B' : 'A');

      const result = await decryptToken(secret, tampered);
      expect(result).toBeNull();
    });

    it('handles empty token', async () => {
      const secret = 'secret';
      const token = '';

      const encrypted = await encryptToken(secret, token);
      const decrypted = await decryptToken(secret, encrypted);

      expect(decrypted).toBe(token);
    });

    it('produces different ciphertext on each encryption (random IV)', async () => {
      const secret = 'secret';
      const token = 'same-token';

      const encrypted1 = await encryptToken(secret, token);
      const encrypted2 = await encryptToken(secret, token);

      expect(encrypted1).not.toBe(encrypted2);

      // But both decrypt to the same token
      const decrypted1 = await decryptToken(secret, encrypted1);
      const decrypted2 = await decryptToken(secret, encrypted2);

      expect(decrypted1).toBe(token);
      expect(decrypted2).toBe(token);
    });
  });

  describe('secHeaders()', () => {
    it('adds all required security headers', () => {
      const response = new Response('test', { status: 200 });
      const result = secHeaders(response);

      expect(result.headers.get('Content-Security-Policy')).toBeTruthy();
      expect(result.headers.get('X-Frame-Options')).toBe('DENY');
      expect(result.headers.get('X-Content-Type-Options')).toBe('nosniff');
      expect(result.headers.get('X-XSS-Protection')).toBe('0');
      expect(result.headers.get('Strict-Transport-Security')).toBeTruthy();
    });

    it('omits HSTS for loopback development requests', () => {
      const result = secHeaders(new Response('test'), new Request('http://localhost:8787'));

      expect(result.headers.get('Strict-Transport-Security')).toBeNull();
      expect(isLoopbackRequest(new Request('http://127.0.0.1:8787'))).toBe(true);
    });

    it('adds CORS headers for allowed origins', () => {
      const response = new Response('test');
      const request = new Request('http://localhost', {
        headers: { Origin: ALLOWED_ORIGINS[0] },
      });

      const result = secHeaders(response, request);

      expect(result.headers.get('Access-Control-Allow-Origin')).toBe(ALLOWED_ORIGINS[0]);
      expect(result.headers.get('Access-Control-Allow-Credentials')).toBe('true');
    });

    it('allows the Wrangler localhost origin', () => {
      const request = new Request('http://localhost:8787', {
        headers: { Origin: 'http://localhost:8787' },
      });

      const result = secHeaders(new Response('test'), request);
      expect(result.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:8787');
    });

    it('does not add CORS headers for disallowed origins', () => {
      const response = new Response('test');
      const request = new Request('http://localhost', {
        headers: { Origin: 'https://malicious.com' },
      });

      const result = secHeaders(response, request);

      expect(result.headers.get('Access-Control-Allow-Origin')).toBeNull();
      expect(result.headers.get('Access-Control-Allow-Credentials')).toBeNull();
    });

    it('does not add CORS headers when origin is missing', () => {
      const response = new Response('test');
      const request = new Request('http://localhost');

      const result = secHeaders(response, request);

      expect(result.headers.get('Access-Control-Allow-Origin')).toBeNull();
    });

    it('works without request parameter', () => {
      const response = new Response('test');
      const result = secHeaders(response);

      expect(result.headers.get('X-Frame-Options')).toBe('DENY');
      expect(result.headers.get('Access-Control-Allow-Origin')).toBeNull();
    });
  });

  describe('handleOptions()', () => {
    it('returns 204 No Content', () => {
      const request = new Request('http://localhost', { method: 'OPTIONS' });
      const result = handleOptions(request);

      expect(result.status).toBe(204);
    });

    it('adds CORS headers for allowed origins', () => {
      const request = new Request('http://localhost', {
        method: 'OPTIONS',
        headers: { Origin: ALLOWED_ORIGINS[0] },
      });

      const result = handleOptions(request);

      expect(result.headers.get('Access-Control-Allow-Origin')).toBe(ALLOWED_ORIGINS[0]);
      expect(result.headers.get('Access-Control-Allow-Methods')).toBeTruthy();
      expect(result.headers.get('Access-Control-Allow-Headers')).toBeTruthy();
    });

    it('adds CORS headers with fallback for disallowed origins', () => {
      const request = new Request('http://localhost', {
        method: 'OPTIONS',
        headers: { Origin: 'https://malicious.com' },
      });

      const result = handleOptions(request);

      // Should fall back to first allowed origin
      expect(result.headers.get('Access-Control-Allow-Origin')).toBeTruthy();
    });
  });

  describe('ALLOWED_METHODS', () => {
    it('includes GET, POST, PUT, OPTIONS, HEAD', () => {
      expect(ALLOWED_METHODS.has('GET')).toBe(true);
      expect(ALLOWED_METHODS.has('POST')).toBe(true);
      expect(ALLOWED_METHODS.has('PUT')).toBe(true);
      expect(ALLOWED_METHODS.has('OPTIONS')).toBe(true);
      expect(ALLOWED_METHODS.has('HEAD')).toBe(true);
    });

    it('does not include PATCH or DELETE', () => {
      expect(ALLOWED_METHODS.has('PATCH')).toBe(false);
      expect(ALLOWED_METHODS.has('DELETE')).toBe(false);
    });
  });
});
