import { describe, expect, it } from 'vitest';
import {
  differingFields,
  nonRetryableShadowError,
  shadowPipelineRunId,
  shadowWorkflowInstanceId,
} from '../../../worker/shadowSync.js';

describe('shadow sync parity comparison', () => {
  it('returns only fields whose values differ', () => {
    expect(differingFields(
      { id: 42, state: 'open', counts: { accept: 2 }, optional: null },
      { id: 42, state: 'closed', counts: { accept: 3 } },
    )).toEqual(['counts', 'state']);
  });

  it('treats absent and null fields as equivalent canonical values', () => {
    expect(differingFields({ id: 42, upstream_url: null }, { id: 42 })).toEqual([]);
  });

  it('reports fields present on only one side when they contain a value', () => {
    expect(differingFields({ id: 42 }, { id: 42, detection_tool: 'Bandit' }))
      .toEqual(['detection_tool']);
  });

  it('gives every legacy trigger a stable, distinct shadow identity', () => {
    const firstLegacyRun = '11111111-1111-4111-8111-111111111111';
    const secondLegacyRun = '22222222-2222-4222-8222-222222222222';

    expect(shadowPipelineRunId(firstLegacyRun)).toBe(`shadow-${firstLegacyRun}`);
    expect(shadowWorkflowInstanceId(firstLegacyRun)).toBe(`shadow-start-${firstLegacyRun}`);
    expect(shadowWorkflowInstanceId(firstLegacyRun)).not.toBe(shadowWorkflowInstanceId(secondLegacyRun));
  });

  it('preserves the Workflow runtime identity for terminal failures', () => {
    const error = nonRetryableShadowError('GitHub authentication failed');

    expect(error.name).toBe('NonRetryableError');
    expect(error.message).toBe('GitHub authentication failed');
  });
});
