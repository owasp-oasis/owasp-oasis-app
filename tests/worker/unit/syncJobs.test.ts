import { describe, expect, it } from 'vitest';
import {
  isMissingSyncObservabilityTableError,
  safeErrorSummary,
  sanitizeMetrics,
} from '../../../worker/syncJobs.js';

describe('sync job public-data sanitization', () => {
  it('keeps only numeric, boolean, and null metrics', () => {
    expect(sanitizeMetrics({
      processed: 12,
      complete: true,
      optional: null,
      contact: 'private@example.test',
      nested: { token: 'secret' },
      invalid_metric_name_with_far_too_many_characters_to_be_accepted_by_the_status_api: 1,
    })).toEqual({ processed: 12, complete: true, optional: null });
  });

  it('redacts credential and contact shaped text from errors', () => {
    const summary = safeErrorSummary(
      'Bearer example-token-value failed for private@example.test with ghp_abcdefghijklmnopqrstuvwxyz1234567890',
    );
    expect(summary).not.toContain('example-token-value');
    expect(summary).not.toContain('private@example.test');
    expect(summary).not.toContain('ghp_');
  });

  it('recognizes only missing observability tables as migration gaps', () => {
    expect(isMissingSyncObservabilityTableError(
      new Error('D1_ERROR: no such table: sync_parity_runs: SQLITE_ERROR'),
    )).toBe(true);
    expect(isMissingSyncObservabilityTableError(
      new Error('D1_ERROR: no such table: pull_requests: SQLITE_ERROR'),
    )).toBe(false);
  });
});
