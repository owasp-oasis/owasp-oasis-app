/**
 * Response recognition calculated from validation availability and OASIS votes.
 *
 * This module intentionally does not import or update the contributor reputation
 * engine. Badges never change scores, ranks, vote weight, or permissions.
 */

import { isMissingSchemaObject } from './schemaCompatibility.js';

export const RESPONSE_BADGE_RULES = {
  criteriaVersion: 1,
  fastWindowDays: 90,
  fastResponseHours: 24,
  fastMinimumResponses: 10,
  fastMinimumRate: 0.8,
  coverageWindowDays: 180,
  coverageWaitHours: 72,
  coverageMinimumResponses: 5,
} as const;

export type ResponseBadgeId = 'first_responder' | 'fast_responder' | 'coverage_contributor';
export type ResponseBadgeState = 'active' | 'locked';

export interface ResponseBadgeCriterion {
  label: string;
  current: number;
  target: number;
  unit: 'count' | 'percent';
  met: boolean;
}

export interface ResponseBadge {
  id: ResponseBadgeId;
  name: string;
  kind: 'achievement' | 'activity';
  state: ResponseBadgeState;
  description: string;
  evidence: string;
  criteria: ResponseBadgeCriterion[];
}

export interface ResponseBadgeMetrics {
  totalResponses: number;
  firstResponses: number;
  responses90d: number;
  fastResponses90d: number;
  fastRate90d: number;
  coverageResponses180d: number;
}

export interface ResponseBadgeSummary {
  badges: ResponseBadge[];
  metrics: ResponseBadgeMetrics;
  rules: typeof RESPONSE_BADGE_RULES;
  calculatedAt: string;
  requestClockMeaning: string;
}

interface MetricsRow {
  total_responses: number | null;
  first_responses: number | null;
  responses_90d: number | null;
  fast_responses_90d: number | null;
  coverage_responses_180d: number | null;
}

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return count === 1 ? singular : pluralForm;
}

export function buildResponseBadgeSummary(
  row: MetricsRow,
  calculatedAt = new Date().toISOString(),
): ResponseBadgeSummary {
  const totalResponses = Number(row.total_responses ?? 0);
  const firstResponses = Number(row.first_responses ?? 0);
  const responses90d = Number(row.responses_90d ?? 0);
  const fastResponses90d = Number(row.fast_responses_90d ?? 0);
  const coverageResponses180d = Number(row.coverage_responses_180d ?? 0);
  const fastRate90d = responses90d > 0 ? fastResponses90d / responses90d : 0;
  const fastRatePercent = Math.round(fastRate90d * 100);

  const metrics: ResponseBadgeMetrics = {
    totalResponses,
    firstResponses,
    responses90d,
    fastResponses90d,
    fastRate90d: Math.round(fastRate90d * 1000) / 1000,
    coverageResponses180d,
  };

  const fastVolumeMet = responses90d >= RESPONSE_BADGE_RULES.fastMinimumResponses;
  const fastRateMet = fastRate90d >= RESPONSE_BADGE_RULES.fastMinimumRate;

  return {
    metrics,
    rules: RESPONSE_BADGE_RULES,
    calculatedAt,
    requestClockMeaning: 'Time since a newly discovered open PR became available in the OASIS Workspace.',
    badges: [
      {
        id: 'first_responder',
        name: 'First Responder',
        kind: 'achievement',
        state: firstResponses > 0 ? 'active' : 'locked',
        description: 'First eligible person to submit a recognized OASIS vote.',
        evidence: firstResponses > 0
          ? `${firstResponses} first ${plural(firstResponses, 'response')}`
          : 'No first responses yet',
        criteria: [{
          label: 'First responses',
          current: firstResponses,
          target: 1,
          unit: 'count',
          met: firstResponses > 0,
        }],
      },
      {
        id: 'fast_responder',
        name: 'Fast Responder',
        kind: 'activity',
        state: fastVolumeMet && fastRateMet ? 'active' : 'locked',
        description: `Responds within ${RESPONSE_BADGE_RULES.fastResponseHours} hours consistently.`,
        evidence: `${fastResponses90d} of ${responses90d} responses within ${RESPONSE_BADGE_RULES.fastResponseHours} hours (${fastRatePercent}%) in the last 90 days`,
        criteria: [
          {
            label: 'Responses in 90 days',
            current: responses90d,
            target: RESPONSE_BADGE_RULES.fastMinimumResponses,
            unit: 'count',
            met: fastVolumeMet,
          },
          {
            label: 'Within 24 hours',
            current: fastRatePercent,
            target: Math.round(RESPONSE_BADGE_RULES.fastMinimumRate * 100),
            unit: 'percent',
            met: fastRateMet,
          },
        ],
      },
      {
        id: 'coverage_contributor',
        name: 'Coverage Contributor',
        kind: 'activity',
        state: coverageResponses180d >= RESPONSE_BADGE_RULES.coverageMinimumResponses ? 'active' : 'locked',
        description: `First to answer work that had waited at least ${RESPONSE_BADGE_RULES.coverageWaitHours} hours.`,
        evidence: `${coverageResponses180d} unattended ${plural(coverageResponses180d, 'request')} covered in the last 180 days`,
        criteria: [{
          label: 'Unattended requests covered',
          current: coverageResponses180d,
          target: RESPONSE_BADGE_RULES.coverageMinimumResponses,
          unit: 'count',
          met: coverageResponses180d >= RESPONSE_BADGE_RULES.coverageMinimumResponses,
        }],
      },
    ],
  };
}

export async function getResponseBadgeSummary(
  db: D1Database,
  login: string,
  now = new Date(),
): Promise<ResponseBadgeSummary> {
  const cutoff90d = new Date(now.getTime() - RESPONSE_BADGE_RULES.fastWindowDays * 86_400_000).toISOString();
  const cutoff180d = new Date(now.getTime() - RESPONSE_BADGE_RULES.coverageWindowDays * 86_400_000).toISOString();

  let row: MetricsRow | null;
  try {
    row = await db.prepare(`
    WITH eligible_responses AS (
      SELECT
        uv.github_login,
        uv.pr_id,
        uv.voted_at,
        vr.requested_at,
        (julianday(uv.voted_at) - julianday(vr.requested_at)) * 24.0 AS response_hours,
        ROW_NUMBER() OVER (
          PARTITION BY uv.pr_id
          ORDER BY uv.voted_at ASC, COALESCE(uv.comment_id, 9223372036854775807) ASC, uv.github_login ASC
        ) AS response_rank
      FROM user_votes uv
      JOIN validation_requests vr ON vr.pr_id = uv.pr_id
      JOIN pull_requests pr ON pr.id = uv.pr_id
      WHERE vr.badge_eligible = 1
        AND vr.status != 'cancelled'
        AND pr.deleted = 0
        AND pr.duplicate_of IS NULL
        AND uv.voted_at >= vr.requested_at
        AND uv.github_login != COALESCE(pr.author, '')
        AND uv.decision IN ('accept', 'modify', 'reject', 'duplicate')
    )
    SELECT
      COUNT(*) AS total_responses,
      COALESCE(SUM(CASE WHEN response_rank = 1 THEN 1 ELSE 0 END), 0) AS first_responses,
      COALESCE(SUM(CASE WHEN voted_at >= ? THEN 1 ELSE 0 END), 0) AS responses_90d,
      COALESCE(SUM(CASE WHEN voted_at >= ? AND response_hours <= ? THEN 1 ELSE 0 END), 0) AS fast_responses_90d,
      COALESCE(SUM(CASE
        WHEN voted_at >= ? AND response_rank = 1 AND response_hours >= ? THEN 1 ELSE 0
      END), 0) AS coverage_responses_180d
    FROM eligible_responses
    WHERE github_login = ?
    `).bind(
      cutoff90d,
      cutoff90d,
      RESPONSE_BADGE_RULES.fastResponseHours,
      cutoff180d,
      RESPONSE_BADGE_RULES.coverageWaitHours,
      login,
    ).first<MetricsRow>();
  } catch (error) {
    if (!isMissingSchemaObject(error)) throw error;
    // The badge migration is additive. During a rolling preview deployment,
    // keep contributor profiles usable and show all badges as locked until
    // validation_requests is available.
    row = null;
  }

  return buildResponseBadgeSummary(row ?? {
    total_responses: 0,
    first_responses: 0,
    responses_90d: 0,
    fast_responses_90d: 0,
    coverage_responses_180d: 0,
  }, now.toISOString());
}
