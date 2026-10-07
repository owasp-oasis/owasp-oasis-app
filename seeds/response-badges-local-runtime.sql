-- Local-preview support for schema managed by migrations 0007-0011.
--
-- Production databases must use the tracked migrations. This idempotent
-- snapshot exists only because the response-badge demo starts from schema.sql,
-- whose final comment intentionally leaves these operational tables to the
-- migration runner.

CREATE TABLE IF NOT EXISTS sync_job_runs (
  id TEXT PRIMARY KEY,
  pipeline_run_id TEXT,
  workflow_instance_id TEXT,
  job_key TEXT NOT NULL,
  label TEXT NOT NULL,
  category TEXT NOT NULL CHECK(category IN ('workspace', 'integration', 'analytics')),
  trigger_type TEXT NOT NULL CHECK(trigger_type IN ('scheduled', 'manual', 'continuation', 'submission')),
  mode TEXT NOT NULL CHECK(mode IN ('legacy', 'shadow', 'live')),
  status TEXT NOT NULL CHECK(status IN ('queued', 'running', 'succeeded', 'failed', 'skipped', 'deferred', 'interrupted')),
  started_at TEXT NOT NULL,
  finished_at TEXT,
  duration_ms INTEGER,
  expected_items INTEGER NOT NULL DEFAULT 0,
  completed_items INTEGER NOT NULL DEFAULT 0,
  failed_items INTEGER NOT NULL DEFAULT 0,
  metrics_json TEXT NOT NULL DEFAULT '{}',
  error_code TEXT,
  error_summary TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sync_job_runs_job_started ON sync_job_runs(job_key, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_job_runs_pipeline ON sync_job_runs(pipeline_run_id, started_at);
CREATE INDEX IF NOT EXISTS idx_sync_job_runs_incomplete ON sync_job_runs(job_key, status, started_at DESC);

CREATE TABLE IF NOT EXISTS sync_job_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_run_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  attempt INTEGER,
  response_status INTEGER,
  message TEXT,
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  FOREIGN KEY(job_run_id) REFERENCES sync_job_runs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sync_job_events_run ON sync_job_events(job_run_id, created_at);

CREATE TABLE IF NOT EXISTS sync_work_items (
  id TEXT PRIMARY KEY,
  pipeline_run_id TEXT NOT NULL,
  job_run_id TEXT NOT NULL,
  job_key TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  cursor TEXT,
  status TEXT NOT NULL CHECK(status IN ('pending', 'leased', 'succeeded', 'failed', 'deferred')),
  attempts INTEGER NOT NULL DEFAULT 0,
  leased_at TEXT,
  lease_expires_at TEXT,
  last_error_code TEXT,
  last_error_summary TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(pipeline_run_id, job_key, entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_sync_work_items_claim ON sync_work_items(pipeline_run_id, job_key, status, created_at);

CREATE TABLE IF NOT EXISTS sync_shadow_entities (
  pipeline_run_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  repository_id INTEGER,
  source_updated_at TEXT,
  fingerprint TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(pipeline_run_id, entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_sync_shadow_entities_type ON sync_shadow_entities(pipeline_run_id, entity_type, repository_id);

CREATE TABLE IF NOT EXISTS sync_parity_runs (
  pipeline_run_id TEXT PRIMARY KEY,
  canonical_pipeline_run_id TEXT NOT NULL,
  canonical_cutoff_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending', 'match', 'mismatch', 'incomplete')),
  comparable_entities INTEGER NOT NULL DEFAULT 0,
  matched_entities INTEGER NOT NULL DEFAULT 0,
  changed_during_run INTEGER NOT NULL DEFAULT 0,
  difference_count INTEGER NOT NULL DEFAULT 0,
  consecutive_matches INTEGER NOT NULL DEFAULT 0,
  eligible_for_cutover INTEGER NOT NULL DEFAULT 0,
  compared_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_parity_differences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pipeline_run_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  difference_type TEXT NOT NULL CHECK(difference_type IN ('source_changed_during_comparison', 'missing_in_shadow', 'extra_in_shadow', 'field_mismatch', 'simulated_side_effect_mismatch')),
  fields_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  FOREIGN KEY(pipeline_run_id) REFERENCES sync_parity_runs(pipeline_run_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sync_parity_differences_run ON sync_parity_differences(pipeline_run_id, entity_type);

CREATE TABLE IF NOT EXISTS sync_daily_budgets (
  budget_date TEXT NOT NULL,
  budget_key TEXT NOT NULL,
  label TEXT NOT NULL,
  unit TEXT NOT NULL,
  configured_limit INTEGER,
  consumed INTEGER NOT NULL DEFAULT 0,
  reserved INTEGER NOT NULL DEFAULT 0,
  deferred INTEGER NOT NULL DEFAULT 0,
  remaining INTEGER,
  reset_at TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(budget_date, budget_key)
);

CREATE INDEX IF NOT EXISTS idx_sync_daily_budgets_date ON sync_daily_budgets(budget_date DESC, budget_key);

CREATE TABLE IF NOT EXISTS analytics_daily_routes (
  metric_date TEXT NOT NULL,
  route_key TEXT NOT NULL,
  page_views INTEGER NOT NULL DEFAULT 0,
  navigation_count INTEGER NOT NULL DEFAULT 0,
  load_ms_sum INTEGER NOT NULL DEFAULT 0,
  load_ms_max INTEGER NOT NULL DEFAULT 0,
  response_2xx INTEGER NOT NULL DEFAULT 0,
  response_3xx INTEGER NOT NULL DEFAULT 0,
  response_4xx INTEGER NOT NULL DEFAULT 0,
  response_5xx INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(metric_date, route_key)
);

CREATE INDEX IF NOT EXISTS idx_analytics_daily_routes_date ON analytics_daily_routes(metric_date DESC, route_key);

CREATE TABLE IF NOT EXISTS analytics_daily_cloudflare (
  metric_date TEXT PRIMARY KEY,
  requests_estimate INTEGER NOT NULL DEFAULT 0,
  visits_estimate INTEGER NOT NULL DEFAULT 0,
  response_bytes INTEGER NOT NULL DEFAULT 0,
  response_2xx INTEGER NOT NULL DEFAULT 0,
  response_3xx INTEGER NOT NULL DEFAULT 0,
  response_4xx INTEGER NOT NULL DEFAULT 0,
  response_5xx INTEGER NOT NULL DEFAULT 0,
  cache_hits_estimate INTEGER NOT NULL DEFAULT 0,
  cache_misses_estimate INTEGER NOT NULL DEFAULT 0,
  sample_interval REAL,
  source_is_estimated INTEGER NOT NULL DEFAULT 1 CHECK(source_is_estimated IN (0, 1)),
  collected_at TEXT NOT NULL,
  source_dataset TEXT NOT NULL DEFAULT 'adaptive' CHECK(source_dataset IN ('adaptive', 'daily_rollup')),
  visits_available INTEGER NOT NULL DEFAULT 1 CHECK(visits_available IN (0, 1)),
  statuses_available INTEGER NOT NULL DEFAULT 1 CHECK(statuses_available IN (0, 1)),
  cache_available INTEGER NOT NULL DEFAULT 1 CHECK(cache_available IN (0, 1))
);

CREATE TABLE IF NOT EXISTS analytics_collection_days (
  metric_date TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'running', 'succeeded', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  started_at TEXT,
  finished_at TEXT,
  error_summary TEXT,
  updated_at TEXT NOT NULL,
  source_dataset TEXT NOT NULL DEFAULT 'adaptive' CHECK(source_dataset IN ('adaptive', 'daily_rollup'))
);

CREATE INDEX IF NOT EXISTS idx_analytics_collection_days_status ON analytics_collection_days(status, metric_date);
CREATE INDEX IF NOT EXISTS idx_analytics_collection_source_status ON analytics_collection_days(source_dataset, status, metric_date);

CREATE TABLE IF NOT EXISTS analytics_dataset_capabilities (
  dataset_key TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL CHECK(enabled IN (0, 1)),
  not_older_than_seconds INTEGER,
  max_duration_seconds INTEGER,
  max_page_size INTEGER,
  available_fields_json TEXT NOT NULL DEFAULT '[]',
  checked_at TEXT NOT NULL,
  error_summary TEXT
);

CREATE TABLE IF NOT EXISTS analytics_daily_engagement (
  metric_date TEXT NOT NULL,
  repo_id INTEGER NOT NULL,
  review_opens INTEGER NOT NULL DEFAULT 0,
  review_closes INTEGER NOT NULL DEFAULT 0,
  active_seconds INTEGER NOT NULL DEFAULT 0,
  votes_submitted INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(metric_date, repo_id)
);

CREATE INDEX IF NOT EXISTS idx_analytics_daily_engagement_date ON analytics_daily_engagement(metric_date DESC, repo_id);

CREATE TABLE IF NOT EXISTS analytics_event_receipts (
  event_id TEXT PRIMARY KEY,
  event_date TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_analytics_event_receipts_expiry ON analytics_event_receipts(expires_at);
