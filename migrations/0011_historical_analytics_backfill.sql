-- Capability-discovered historical Cloudflare analytics backfill.
-- Dataset availability is zone/plan specific, so discovery results and the
-- source/coverage of every archived day are retained for administrator review.

ALTER TABLE analytics_collection_days
  ADD COLUMN source_dataset TEXT NOT NULL DEFAULT 'adaptive'
  CHECK(source_dataset IN ('adaptive', 'daily_rollup'));

ALTER TABLE analytics_daily_cloudflare
  ADD COLUMN source_dataset TEXT NOT NULL DEFAULT 'adaptive'
  CHECK(source_dataset IN ('adaptive', 'daily_rollup'));

ALTER TABLE analytics_daily_cloudflare
  ADD COLUMN visits_available INTEGER NOT NULL DEFAULT 1
  CHECK(visits_available IN (0, 1));

ALTER TABLE analytics_daily_cloudflare
  ADD COLUMN statuses_available INTEGER NOT NULL DEFAULT 1
  CHECK(statuses_available IN (0, 1));

ALTER TABLE analytics_daily_cloudflare
  ADD COLUMN cache_available INTEGER NOT NULL DEFAULT 1
  CHECK(cache_available IN (0, 1));

CREATE INDEX IF NOT EXISTS idx_analytics_collection_source_status
  ON analytics_collection_days(source_dataset, status, metric_date);

CREATE TABLE IF NOT EXISTS analytics_dataset_capabilities (
  dataset_key             TEXT PRIMARY KEY,
  enabled                 INTEGER NOT NULL CHECK(enabled IN (0, 1)),
  not_older_than_seconds  INTEGER,
  max_duration_seconds    INTEGER,
  max_page_size           INTEGER,
  available_fields_json   TEXT NOT NULL DEFAULT '[]',
  checked_at              TEXT NOT NULL,
  error_summary           TEXT
);
