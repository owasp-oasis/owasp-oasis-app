-- Record when a pull request first becomes available for OASIS validation.
-- Response recognition is calculated independently from contributor reputation.

CREATE TABLE IF NOT EXISTS validation_requests (
  pr_id              INTEGER PRIMARY KEY,
  requested_at       TEXT NOT NULL,
  request_source     TEXT NOT NULL DEFAULT 'workspace_sync'
                     CHECK(request_source IN ('workspace_sync', 'explicit_request')),
  status             TEXT NOT NULL DEFAULT 'open'
                     CHECK(status IN ('open', 'responded', 'closed', 'cancelled')),
  badge_eligible     INTEGER NOT NULL DEFAULT 1
                     CHECK(badge_eligible IN (0, 1)),
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL,
  FOREIGN KEY (pr_id) REFERENCES pull_requests(id)
);

CREATE INDEX IF NOT EXISTS idx_validation_requests_eligibility
  ON validation_requests(badge_eligible, requested_at);

-- Existing PRs have no trustworthy OASIS availability timestamp. Preserve them
-- for observation, but never award response recognition from an invented clock.
INSERT OR IGNORE INTO validation_requests (
  pr_id, requested_at, request_source, status, badge_eligible, created_at, updated_at
)
SELECT
  id,
  COALESCE(synced_at, created_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  'workspace_sync',
  CASE WHEN state = 'open' AND deleted = 0 THEN 'open' ELSE 'closed' END,
  0,
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM pull_requests;
