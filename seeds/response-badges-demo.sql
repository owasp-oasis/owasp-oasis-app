-- Local-only response badge demo. Dates are relative so rolling windows remain testable.

DELETE FROM comment_reactions;
DELETE FROM pr_comments;
DELETE FROM pr_participants;
DELETE FROM user_votes;
DELETE FROM validation_requests;
DELETE FROM pull_requests;
DELETE FROM contributors;
DELETE FROM repos;

INSERT INTO repos (
  id, name, full_name, description, language, open_prs, stars, upstream_url, active, synced_at
) VALUES (
  900101,
  'response-badge-demo',
  'owasp-oasis/response-badge-demo',
  'Local records for testing OASIS response recognition.',
  'TypeScript',
  15,
  0,
  'https://github.com/owasp-oasis',
  1,
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
);

WITH RECURSIVE sequence(n) AS (
  SELECT 1
  UNION ALL
  SELECT n + 1 FROM sequence WHERE n < 15
)
INSERT INTO pull_requests (
  id, repo_id, repo_name, number, title, state, author, html_url,
  comment_count, oasis_comment_count, participants, consensus_accept,
  created_at, updated_at, synced_at, deleted
)
SELECT
  910000 + n,
  900101,
  'response-badge-demo',
  n,
  'Demo security validation request #' || n,
  'open',
  'demo-fix-author',
  'https://github.com/owasp-oasis/owasp-oasis-app/pull/' || n,
  1,
  1,
  1,
  1,
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-' || (n + 2) || ' days'),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  0
FROM sequence;

WITH RECURSIVE sequence(n) AS (
  SELECT 1
  UNION ALL
  SELECT n + 1 FROM sequence WHERE n < 15
)
INSERT INTO validation_requests (
  pr_id, requested_at, request_source, status, badge_eligible, created_at, updated_at
)
SELECT
  910000 + n,
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-' || (n + 1) || ' days'),
  'workspace_sync',
  'responded',
  1,
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-' || (n + 1) || ' days'),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM sequence;

-- Alice has ten recent responses; exactly eight were within 24 hours.
WITH RECURSIVE sequence(n) AS (
  SELECT 1
  UNION ALL
  SELECT n + 1 FROM sequence WHERE n < 10
)
INSERT INTO user_votes (
  github_login, pr_id, repo_name, pr_number, decision, comment_id, voted_at
)
SELECT
  'alice-validator',
  910000 + n,
  'response-badge-demo',
  n,
  'accept',
  920000 + n,
  strftime(
    '%Y-%m-%dT%H:%M:%fZ',
    'now',
    '-' || (n + 1) || ' days',
    CASE WHEN n <= 8 THEN '+12 hours' ELSE '+30 hours' END
  )
FROM sequence;

-- Casey is first on five requests that waited at least 72 hours.
WITH RECURSIVE sequence(n) AS (
  SELECT 11
  UNION ALL
  SELECT n + 1 FROM sequence WHERE n < 15
)
INSERT INTO user_votes (
  github_login, pr_id, repo_name, pr_number, decision, comment_id, voted_at
)
SELECT
  'casey-coverage',
  910000 + n,
  'response-badge-demo',
  n,
  'modify',
  920000 + n,
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-' || (n + 1) || ' days', '+80 hours')
FROM sequence;

INSERT INTO pr_comments (
  id, pr_id, repo_name, pr_number, login, decision, created_at, pr_created_at
)
SELECT
  comment_id,
  pr_id,
  repo_name,
  pr_number,
  github_login,
  decision,
  voted_at,
  (SELECT created_at FROM pull_requests WHERE id = user_votes.pr_id)
FROM user_votes;

INSERT INTO pr_participants (
  pr_id, repo_name, pr_number, login, interactions, decision, reactions_received
)
SELECT pr_id, repo_name, pr_number, github_login, 1, decision, 0
FROM user_votes;

INSERT INTO contributors (
  login, avatar_url, prs_worked, total_interactions, reactions_received,
  reactions_given, accepts, modifies, rejects, comment_score, peer_score,
  reaction_score, trust_score, base_reputation, modified_reputation,
  rank_90d, rank_90d_oldest_activity, synced_at
) VALUES
  (
    'alice-validator', NULL, 10, 10, 4, 5, 10, 0, 0, 10, 2, 1.25, 0,
    13.25, 15.90, 1,
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-11 days'),
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  ),
  (
    'casey-coverage', NULL, 5, 5, 2, 2, 0, 5, 0, 5, 1, 0.5, 0,
    6.5, 7.15, 2,
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-16 days'),
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  );

INSERT OR REPLACE INTO sync_state (key, value)
VALUES ('last_synced_at', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
