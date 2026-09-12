import { describe, expect, it } from 'vitest';
import { buildResponseBadgeSummary } from '../../../worker/responseBadges.js';

const emptyMetrics = {
  total_responses: 0,
  first_responses: 0,
  responses_90d: 0,
  fast_responses_90d: 0,
  coverage_responses_180d: 0,
};

describe('response badge rules', () => {
  it('earns the cumulative First Responder achievement after one first response', () => {
    const summary = buildResponseBadgeSummary({
      ...emptyMetrics,
      total_responses: 1,
      first_responses: 1,
      responses_90d: 1,
      fast_responses_90d: 1,
    }, '2026-09-12T12:00:00.000Z');

    expect(summary.badges.find(badge => badge.id === 'first_responder')).toMatchObject({
      state: 'active',
      kind: 'achievement',
      evidence: '1 first response',
    });
    expect(summary.rules.criteriaVersion).toBe(1);
  });

  it('requires both response volume and timely-response rate for Fast Responder', () => {
    const earned = buildResponseBadgeSummary({
      ...emptyMetrics,
      total_responses: 10,
      responses_90d: 10,
      fast_responses_90d: 8,
    });
    const poorRate = buildResponseBadgeSummary({
      ...emptyMetrics,
      total_responses: 10,
      responses_90d: 10,
      fast_responses_90d: 7,
    });
    const tooFew = buildResponseBadgeSummary({
      ...emptyMetrics,
      total_responses: 9,
      responses_90d: 9,
      fast_responses_90d: 9,
    });

    expect(earned.badges.find(badge => badge.id === 'fast_responder')?.state).toBe('active');
    expect(poorRate.badges.find(badge => badge.id === 'fast_responder')).toMatchObject({
      state: 'locked',
      criteria: [
        expect.objectContaining({ met: true }),
        expect.objectContaining({ current: 70, target: 80, met: false }),
      ],
    });
    expect(tooFew.badges.find(badge => badge.id === 'fast_responder')?.state).toBe('locked');
  });

  it('requires five unattended first responses for Coverage Contributor', () => {
    const summary = buildResponseBadgeSummary({
      ...emptyMetrics,
      total_responses: 5,
      first_responses: 5,
      coverage_responses_180d: 5,
    });

    expect(summary.badges.find(badge => badge.id === 'coverage_contributor')?.state).toBe('active');
  });
});
