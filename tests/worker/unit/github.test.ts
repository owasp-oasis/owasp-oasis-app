/**
 * Unit tests for github.ts: parsers, bot detection, reaction polarity, URL parsing
 * All tests are synchronous and pure.
 */

import { describe, it, expect } from 'vitest';
import {
  parseDecision,
  parseDuplicateParent,
  parseDetectionTool,
  normaliseToolName,
  isAutomatedAccount,
  isValidatorBot,
  reactionPolarity,
  parseGitHubUrl,
  POSITIVE_REACTIONS,
  NEGATIVE_REACTIONS,
} from '../../../worker/github.js';

describe('github.ts', () => {
  describe('parseDecision()', () => {
    it('parses accept decision from validation template', () => {
      const body = `
## validation summary: This is a valid fix

| decision | accept |
| --- | --- |
      `;
      expect(parseDecision(body)).toBe('accept');
    });

    it('parses modify decision', () => {
      const body = `
## validation summary: Needs modification

| decision | modify |
| --- | --- |
      `;
      expect(parseDecision(body)).toBe('modify');
    });

    it('parses reject decision', () => {
      const body = `
## rejection summary: This fix is not suitable

| decision | reject |
| --- | --- |
      `;
      expect(parseDecision(body)).toBe('reject');
    });

    it('parses duplicate decision', () => {
      const body = `
## duplicate report: This PR duplicates #123

| parent pr | 123 |
| --- | --- |
      `;
      expect(parseDecision(body)).toBe('duplicate');
    });

    it('handles case-insensitive matching', () => {
      const body = `
## Validation Summary: uppercase test

| decision | ACCEPT |
| --- | --- |
      `;
      expect(parseDecision(body)).toBe('accept');
    });

    it('returns null for null body', () => {
      expect(parseDecision(null)).toBe(null);
    });

    it('returns null when no template found', () => {
      expect(parseDecision('Just a regular comment')).toBe(null);
    });

    it('prioritizes duplicate over other decisions', () => {
      const body = `
## duplicate report: This is a duplicate

## validation summary: And it would be accepted anyway

| parent pr | 456 |
| decision | accept |
      `;
      expect(parseDecision(body)).toBe('duplicate');
    });

    it('prioritizes reject when no duplicate', () => {
      const body = `
## rejection summary: Not valid

## validation summary: Would accept

| decision | reject |
      `;
      expect(parseDecision(body)).toBe('reject');
    });
  });

  describe('parseDuplicateParent()', () => {
    it('parses #123 format', () => {
      const body = '| parent pr | #123 |';
      expect(parseDuplicateParent(body)).toBe(123);
    });

    it('parses /pull/123 format', () => {
      const body = '| parent pr | https://github.com/owasp-oasis/repo/pull/456 |';
      expect(parseDuplicateParent(body)).toBe(456);
    });

    it('parses | 123 | table format', () => {
      const body = '| parent pr | 789 |';
      expect(parseDuplicateParent(body)).toBe(789);
    });

    it('returns null when no parent row found', () => {
      expect(parseDuplicateParent('random content')).toBe(null);
    });

    it('returns null for null body', () => {
      expect(parseDuplicateParent(null)).toBe(null);
    });
  });

  describe('parseDetectionTool()', () => {
    it('parses AppSecAI from body', () => {
      const body = `
**Detected by:** AppSecAI
      `;
      expect(parseDetectionTool(body)).toBe('AppSecAI');
    });

    it('parses Semgrep OSS', () => {
      const body = '**Detected by:** Semgrep OSS';
      expect(parseDetectionTool(body)).toBe('Semgrep OSS');
    });

    it('parses OpenGrep', () => {
      const body = '**Detected by:** OpenGrep';
      expect(parseDetectionTool(body)).toBe('OpenGrep');
    });

    it('returns null when no detection tool found', () => {
      expect(parseDetectionTool('No tool mentioned')).toBe(null);
    });

    it('returns null for null body', () => {
      expect(parseDetectionTool(null)).toBe(null);
    });
  });

  describe('normaliseToolName()', () => {
    it('normalizes AppSecAI variants', () => {
      expect(normaliseToolName('appsecai')).toBe('AppSecAI');
      expect(normaliseToolName('AppSecAI')).toBe('AppSecAI');
      expect(normaliseToolName('APPSECAI')).toBe('AppSecAI');
      expect(normaliseToolName('fenix')).toBe('AppSecAI');
      expect(normaliseToolName('Fenix')).toBe('AppSecAI');
    });

    it('normalizes OpenGrep', () => {
      expect(normaliseToolName('opengrep')).toBe('OpenGrep');
      expect(normaliseToolName('OpenGrep')).toBe('OpenGrep');
    });

    it('normalizes Semgrep', () => {
      expect(normaliseToolName('semgrep')).toBe('Semgrep OSS');
      expect(normaliseToolName('Semgrep')).toBe('Semgrep OSS');
    });

    it('returns truncated name for unknown tools (max 60 chars)', () => {
      const longName = 'VeryLongToolName' + 'x'.repeat(50);
      const result = normaliseToolName(longName);
      expect(result.length).toBeLessThanOrEqual(60);
    });

    it('returns original name for short unknown tools', () => {
      expect(normaliseToolName('CustomTool')).toBe('CustomTool');
    });
  });

  describe('isAutomatedAccount()', () => {
    it('detects [bot] suffix', () => {
      expect(isAutomatedAccount('dependabot[bot]')).toBe(true);
      expect(isAutomatedAccount('some-bot[bot]')).toBe(true);
    });

    it('detects bot pattern', () => {
      expect(isAutomatedAccount('testbot')).toBe(true);
      expect(isAutomatedAccount('mybot-service')).toBe(true);
    });

    it('detects ci pattern', () => {
      expect(isAutomatedAccount('github-ci')).toBe(true);
    });

    it('detects auto pattern', () => {
      expect(isAutomatedAccount('auto-updater')).toBe(true);
    });

    it('detects deploy pattern', () => {
      expect(isAutomatedAccount('auto-deployer')).toBe(true);
    });

    it('detects release pattern', () => {
      expect(isAutomatedAccount('release-bot')).toBe(true);
    });

    it('detects dependabot, renovate, stale', () => {
      expect(isAutomatedAccount('dependabot')).toBe(true);
      expect(isAutomatedAccount('renovate')).toBe(true);
      expect(isAutomatedAccount('stale[bot]')).toBe(true);
    });

    it('detects codecov, coveralls, imgbot', () => {
      expect(isAutomatedAccount('codecov')).toBe(true);
      expect(isAutomatedAccount('coveralls')).toBe(true);
      expect(isAutomatedAccount('imgbot')).toBe(true);
    });

    it('detects allcontributors', () => {
      expect(isAutomatedAccount('allcontributors[bot]')).toBe(true);
    });

    it('detects snyk, sonar', () => {
      expect(isAutomatedAccount('snyk')).toBe(true);
      expect(isAutomatedAccount('sonar')).toBe(true);
    });

    it('allows human accounts', () => {
      expect(isAutomatedAccount('octocat')).toBe(false);
      expect(isAutomatedAccount('john-doe')).toBe(false);
    });

    it('returns true for null/undefined', () => {
      expect(isAutomatedAccount(null)).toBe(true);
      expect(isAutomatedAccount(undefined)).toBe(true);
    });

    it('is case-insensitive', () => {
      expect(isAutomatedAccount('BOT')).toBe(true);
      expect(isAutomatedAccount('DepENDABOT')).toBe(true);
    });
  });

  describe('isValidatorBot()', () => {
    it('recognizes validator bot logins', () => {
      // DryRun Security validator bot should be recognized
      expect(isValidatorBot('dryrun-security[bot]')).toBe(true);
    });

    it('rejects non-validator bots', () => {
      expect(isValidatorBot('dependabot')).toBe(false);
      expect(isValidatorBot('renovate')).toBe(false);
    });

    it('rejects human logins', () => {
      expect(isValidatorBot('octocat')).toBe(false);
    });

    it('handles null/undefined', () => {
      expect(isValidatorBot(null)).toBe(false);
      expect(isValidatorBot(undefined)).toBe(false);
    });
  });

  describe('reactionPolarity()', () => {
    it('classifies positive reactions', () => {
      for (const reaction of POSITIVE_REACTIONS) {
        expect(reactionPolarity(reaction)).toBe('positive');
      }
    });

    it('classifies negative reactions', () => {
      for (const reaction of NEGATIVE_REACTIONS) {
        expect(reactionPolarity(reaction)).toBe('negative');
      }
    });

    it('classifies neutral reactions', () => {
      expect(reactionPolarity('eyes')).toBe('neutral');
      expect(reactionPolarity('bookmark')).toBe('neutral');
    });

    it('handles unknown reactions as neutral', () => {
      expect(reactionPolarity('unknown-reaction')).toBe('neutral');
    });
  });

  describe('parseGitHubUrl()', () => {
    it('parses valid GitHub URLs', () => {
      expect(parseGitHubUrl('https://github.com/octocat/Hello-World')).toEqual({
        owner: 'octocat',
        repo: 'Hello-World',
      });
    });

    it('ignores trailing slashes', () => {
      expect(parseGitHubUrl('https://github.com/octocat/Hello-World/')).toEqual({
        owner: 'octocat',
        repo: 'Hello-World',
      });
    });

    it('returns null for non-GitHub domains', () => {
      expect(parseGitHubUrl('https://gitlab.com/user/repo')).toBe(null);
    });

    it('returns null for malformed URLs', () => {
      expect(parseGitHubUrl('not a url')).toBe(null);
    });

    it('returns null for short paths', () => {
      expect(parseGitHubUrl('https://github.com/octocat')).toBe(null);
    });

    it('handles http URLs', () => {
      expect(parseGitHubUrl('http://github.com/user/repo')).toEqual({
        owner: 'user',
        repo: 'repo',
      });
    });
  });
});
