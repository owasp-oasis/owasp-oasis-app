-- Privacy-safe administrative analytics. These tables intentionally contain
-- no login, email, IP address, user-agent, referrer, query string, or stable
-- per-user pseudonym. Detailed daily aggregates are retained for 400 days.

CREATE TABLE IF NOT EXISTS analytics_daily_routes (
  metric_date       TEXT NOT NULL,
  route_key         TEXT NOT NULL,
  page_views        INTEGER NOT NULL DEFAULT 0,
  navigation_count  INTEGER NOT NULL DEFAULT 0,
  load_ms_sum       INTEGER NOT NULL DEFAULT 0,
  load_ms_max       INTEGER NOT NULL DEFAULT 0,
  response_2xx      INTEGER NOT NULL DEFAULT 0,
  response_3xx      INTEGER NOT NULL DEFAULT 0,
  response_4xx      INTEGER NOT NULL DEFAULT 0,
  response_5xx      INTEGER NOT NULL DEFAULT 0,
  updated_at        TEXT NOT NULL,
  PRIMARY KEY(metric_date, route_key)
);

CREATE INDEX IF NOT EXISTS idx_analytics_daily_routes_date
  ON analytics_daily_routes(metric_date DESC, route_key);

CREATE TABLE IF NOT EXISTS analytics_daily_cloudflare (
  metric_date          TEXT PRIMARY KEY,
  requests_estimate    INTEGER NOT NULL DEFAULT 0,
  visits_estimate      INTEGER NOT NULL DEFAULT 0,
  response_bytes       INTEGER NOT NULL DEFAULT 0,
  response_2xx         INTEGER NOT NULL DEFAULT 0,
  response_3xx         INTEGER NOT NULL DEFAULT 0,
  response_4xx         INTEGER NOT NULL DEFAULT 0,
  response_5xx         INTEGER NOT NULL DEFAULT 0,
  cache_hits_estimate  INTEGER NOT NULL DEFAULT 0,
  cache_misses_estimate INTEGER NOT NULL DEFAULT 0,
  sample_interval      REAL,
  source_is_estimated  INTEGER NOT NULL DEFAULT 1 CHECK(source_is_estimated IN (0, 1)),
  collected_at         TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS analytics_collection_days (
  metric_date    TEXT PRIMARY KEY,
  status         TEXT NOT NULL DEFAULT 'pending'
                 CHECK(status IN ('pending', 'running', 'succeeded', 'failed')),
  attempts       INTEGER NOT NULL DEFAULT 0,
  started_at     TEXT,
  finished_at    TEXT,
  error_summary  TEXT,
  updated_at     TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_analytics_collection_days_status
  ON analytics_collection_days(status, metric_date);

CREATE TABLE IF NOT EXISTS analytics_daily_engagement (
  metric_date       TEXT NOT NULL,
  repo_id           INTEGER NOT NULL,
  review_opens      INTEGER NOT NULL DEFAULT 0,
  review_closes     INTEGER NOT NULL DEFAULT 0,
  active_seconds    INTEGER NOT NULL DEFAULT 0,
  votes_submitted   INTEGER NOT NULL DEFAULT 0,
  updated_at        TEXT NOT NULL,
  PRIMARY KEY(metric_date, repo_id)
);

CREATE INDEX IF NOT EXISTS idx_analytics_daily_engagement_date
  ON analytics_daily_engagement(metric_date DESC, repo_id);

-- Random event IDs exist only to make retrying telemetry idempotent. They are
-- not tied to an account and are deleted after two days.
CREATE TABLE IF NOT EXISTS analytics_event_receipts (
  event_id     TEXT PRIMARY KEY,
  event_date   TEXT NOT NULL,
  expires_at   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_analytics_event_receipts_expiry
  ON analytics_event_receipts(expires_at);
