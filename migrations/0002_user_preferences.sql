-- Persist per-user Workspace matching and onboarding preferences.
--
-- Existing databases may already have this table from schema.sql, while
-- migration-managed databases created before preferences were introduced do
-- not. IF NOT EXISTS keeps the migration safe for both database histories.

CREATE TABLE IF NOT EXISTS user_preferences (
  github_login        TEXT PRIMARY KEY,
  languages           TEXT,
  severities          TEXT,
  experience          TEXT,
  onboarding_version  TEXT,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL
);
