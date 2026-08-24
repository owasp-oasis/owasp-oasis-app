/**
 * Unit tests for validation.ts: sanitize, vEmail, vName, vGitHub, vRole, parseBody, hashString
 * All tests are synchronous and pure except for hashString which uses Web Crypto.
 */

import { describe, it, expect } from 'vitest';
import {
  sanitize,
  vEmail,
  vName,
  vGitHub,
  vRole,
  parseBody,
  hashString,
} from '../../../worker/validation.js';

describe('validation.ts', () => {
  describe('sanitize()', () => {
    it('removes HTML tags', () => {
      expect(sanitize('<script>alert("xss")</script>')).toBe('alert("xss")');
      expect(sanitize('hello<br>world')).toBe('helloworld');
    });

    it('removes control characters', () => {
      expect(sanitize('hello\x00world')).toBe('helloworld');
      expect(sanitize('hello\x01\x02world')).toBe('helloworld');
    });

    it('trims whitespace', () => {
      expect(sanitize('  hello  ')).toBe('hello');
      expect(sanitize('\nhello\n')).toBe('hello');
    });

    it('handles null and undefined', () => {
      expect(sanitize(null)).toBe('');
      expect(sanitize(undefined)).toBe('');
    });

    it('converts non-strings to empty string', () => {
      expect(sanitize(123)).toBe('');
      expect(sanitize(true)).toBe('');
      expect(sanitize({} as any)).toBe('');
      expect(sanitize([] as any)).toBe('');
    });
  });

  describe('vEmail()', () => {
    it('accepts valid email addresses', () => {
      expect(vEmail('user@oasis-test.internal')).toEqual({ ok: true, val: 'user@oasis-test.internal' });
      expect(vEmail('john.doe+tag@company.org')).toEqual({
        ok: true,
        val: 'john.doe+tag@company.org',
      });
    });

    it('normalizes to lowercase', () => {
      expect(vEmail('User@OASIS-TEST.INTERNAL')).toEqual({ ok: true, val: 'user@oasis-test.internal' });
    });

    it('rejects empty email', () => {
      expect(vEmail('')).toEqual({ ok: false, error: expect.any(String) });
      expect(vEmail(null)).toEqual({ ok: false, error: expect.any(String) });
    });

    it('rejects email exceeding max length (254)', () => {
      const longEmail = 'a'.repeat(250) + '@test.com';
      expect(vEmail(longEmail)).toEqual({ ok: false, error: expect.any(String) });
    });

    it('rejects blocked domains', () => {
      const blockedDomains = [
        'test.com',
        'example.com',
        'mailinator.com',
        'guerrillamail.com',
        'tempmail.com',
        'throwam.com',
      ];

      for (const domain of blockedDomains) {
        const result = vEmail(`user@${domain}`);
        expect(result.ok).toBe(false);
      }
    });

    it('rejects invalid email format', () => {
      expect(vEmail('notanemail')).toEqual({ ok: false, error: expect.any(String) });
      expect(vEmail('user@')).toEqual({ ok: false, error: expect.any(String) });
      expect(vEmail('@example.com')).toEqual({ ok: false, error: expect.any(String) });
    });
  });

  describe('vName()', () => {
    it('accepts valid names', () => {
      expect(vName('John Doe')).toEqual({ ok: true, val: 'John Doe' });
      expect(vName('Ab')).toEqual({ ok: true, val: 'Ab' });
    });

    it('rejects names shorter than 2 characters', () => {
      expect(vName('A')).toEqual({ ok: false, error: expect.any(String) });
      expect(vName('')).toEqual({ ok: false, error: expect.any(String) });
    });

    it('rejects names longer than 100 characters', () => {
      const longName = 'A'.repeat(101);
      expect(vName(longName)).toEqual({ ok: false, error: expect.any(String) });
    });

    it('accepts name exactly 100 characters', () => {
      const name100 = 'A'.repeat(100);
      expect(vName(name100)).toEqual({ ok: true, val: name100 });
    });

    it('sanitizes HTML and control characters', () => {
      expect(vName('<script>John</script>')).toEqual({ ok: true, val: 'John' });
    });
  });

  describe('vGitHub()', () => {
    it('accepts valid GitHub usernames', () => {
      expect(vGitHub('octocat')).toEqual({ ok: true, val: 'octocat' });
      expect(vGitHub('john-doe')).toEqual({ ok: true, val: 'john-doe' });
      expect(vGitHub('user123')).toEqual({ ok: true, val: 'user123' });
    });

    it('strips leading @ symbol', () => {
      expect(vGitHub('@octocat')).toEqual({ ok: true, val: 'octocat' });
    });

    it('accepts empty string as valid (optional field)', () => {
      expect(vGitHub('')).toEqual({ ok: true, val: '' });
      expect(vGitHub(null)).toEqual({ ok: true, val: '' });
    });

    it('rejects usernames exceeding max length (39)', () => {
      const longUsername = 'a'.repeat(40);
      expect(vGitHub(longUsername)).toEqual({ ok: false, error: expect.any(String) });
    });

    it('rejects usernames starting with hyphen', () => {
      expect(vGitHub('-user')).toEqual({ ok: false, error: expect.any(String) });
    });

    it('rejects usernames ending with hyphen', () => {
      expect(vGitHub('user-')).toEqual({ ok: false, error: expect.any(String) });
    });

    it('rejects usernames with invalid characters', () => {
      expect(vGitHub('user@name')).toEqual({ ok: false, error: expect.any(String) });
      expect(vGitHub('user.name')).toEqual({ ok: false, error: expect.any(String) });
    });
  });

  describe('vRole()', () => {
    it('accepts all valid roles', () => {
      expect(vRole('validator')).toEqual({ ok: true, val: 'validator' });
      expect(vRole('sponsor')).toEqual({ ok: true, val: 'sponsor' });
      expect(vRole('general')).toEqual({ ok: true, val: 'general' });
      expect(vRole('')).toEqual({ ok: true, val: '' });
    });

    it('rejects invalid roles', () => {
      expect(vRole('admin')).toEqual({ ok: false, error: expect.any(String) });
      expect(vRole('user')).toEqual({ ok: false, error: expect.any(String) });
    });
  });

  describe('parseBody()', () => {
    it('parses valid JSON object', async () => {
      const request = new Request('http://localhost', {
        method: 'POST',
        body: JSON.stringify({ name: 'John', email: 'john@example.com' }),
        headers: { 'Content-Type': 'application/json' },
      });

      const result = await parseBody(request);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.val).toEqual({ name: 'John', email: 'john@example.com' });
      }
    });

    it('rejects wrong Content-Type', async () => {
      const request = new Request('http://localhost', {
        method: 'POST',
        body: '{}',
        headers: { 'Content-Type': 'text/plain' },
      });

      const result = await parseBody(request);
      expect(result.ok).toBe(false);
    });

    it('rejects body exceeding max size (8KB)', async () => {
      const largeBody = JSON.stringify({ data: 'x'.repeat(9000) });
      const request = new Request('http://localhost', {
        method: 'POST',
        body: largeBody,
        headers: { 'Content-Type': 'application/json', 'Content-Length': String(largeBody.length) },
      });

      const result = await parseBody(request);
      expect(result.ok).toBe(false);
    });

    it('rejects malformed JSON', async () => {
      const request = new Request('http://localhost', {
        method: 'POST',
        body: '{invalid json}',
        headers: { 'Content-Type': 'application/json' },
      });

      const result = await parseBody(request);
      expect(result.ok).toBe(false);
    });

    it('rejects non-object bodies (arrays)', async () => {
      const request = new Request('http://localhost', {
        method: 'POST',
        body: JSON.stringify([1, 2, 3]),
        headers: { 'Content-Type': 'application/json' },
      });

      const result = await parseBody(request);
      expect(result.ok).toBe(false);
    });

    it('rejects primitive values', async () => {
      const request = new Request('http://localhost', {
        method: 'POST',
        body: JSON.stringify('string'),
        headers: { 'Content-Type': 'application/json' },
      });

      const result = await parseBody(request);
      expect(result.ok).toBe(false);
    });
  });

  describe('hashString()', () => {
    it('returns a 64-character hex string (SHA-256)', async () => {
      const hash = await hashString('test');
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('produces consistent hash for same input', async () => {
      const hash1 = await hashString('same-input');
      const hash2 = await hashString('same-input');
      expect(hash1).toBe(hash2);
    });

    it('produces different hash for different inputs', async () => {
      const hash1 = await hashString('input1');
      const hash2 = await hashString('input2');
      expect(hash1).not.toBe(hash2);
    });

    it('handles empty string', async () => {
      const hash = await hashString('');
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });
  });
});
