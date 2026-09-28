-- Free-tier-safe canonical synchronization controls.
--
-- The lock prevents cron, manual canaries, and Workflow continuations from
-- starting overlapping canonical writers. The schedule is disabled by
-- default so deployment cannot mutate production until an administrator has
-- accepted a manual canary.

CREATE TABLE IF NOT EXISTS sync_pipeline_locks (
  lock_key       TEXT PRIMARY KEY,
  pipeline_run_id TEXT NOT NULL,
  acquired_at    TEXT NOT NULL,
  lease_expires_at TEXT NOT NULL
);

INSERT OR IGNORE INTO sync_state (key, value) VALUES ('canonical_sync_enabled', '0');
INSERT OR IGNORE INTO sync_state (key, value) VALUES ('canonical_pipeline_run_id', '');
INSERT OR IGNORE INTO sync_state (key, value) VALUES ('canonical_pipeline_phase', 'idle');
INSERT OR IGNORE INTO sync_state (key, value) VALUES ('canonical_pipeline_updated_at', '2020-01-01T00:00:00Z');
