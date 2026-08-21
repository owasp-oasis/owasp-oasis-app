-- Durable HubSpot outbox and one-time backfill for existing form submissions.

CREATE TABLE IF NOT EXISTS hubspot_sync_queue (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  source_type     TEXT NOT NULL CHECK(source_type IN ('registration', 'application')),
  source_key      TEXT NOT NULL,
  payload_json    TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK(status IN ('pending', 'processing', 'synced')),
  attempts        INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT NOT NULL,
  locked_at       TEXT,
  last_error      TEXT,
  synced_at       TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  UNIQUE(source_type, source_key)
);

CREATE INDEX IF NOT EXISTS idx_hubspot_sync_pending
  ON hubspot_sync_queue(status, next_attempt_at);

INSERT OR IGNORE INTO hubspot_sync_queue (
  source_type, source_key, payload_json, status, attempts,
  next_attempt_at, created_at, updated_at
)
SELECT
  'registration',
  lower(email),
  json_object(
    'source', 'registration',
    'email', lower(email),
    'name', name,
    'github', coalesce(github, ''),
    'role', coalesce(role, ''),
    'organization', '',
    'submitted_at', created_at
  ),
  'pending',
  0,
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM registrations;

INSERT OR IGNORE INTO hubspot_sync_queue (
  source_type, source_key, payload_json, status, attempts,
  next_attempt_at, created_at, updated_at
)
SELECT
  'application',
  lower(email) || ':' || lower(role),
  json_object(
    'source', 'application',
    'email', lower(email),
    'name', name,
    'github', coalesce(github, ''),
    'role', role,
    'organization', coalesce(org, ''),
    'submitted_at', created_at
  ),
  'pending',
  0,
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM applications;
