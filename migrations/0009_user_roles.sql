-- Rudimentary GitHub-backed application roles.
-- This deliberately keeps authorization server-side and is intended to be
-- replaced by a fuller identity/permission system in a future migration.

ALTER TABLE user_sessions ADD COLUMN github_user_id INTEGER;

CREATE INDEX IF NOT EXISTS idx_user_sessions_github_user_id
  ON user_sessions(github_user_id);

CREATE TABLE IF NOT EXISTS user_roles (
  github_user_id             INTEGER PRIMARY KEY,
  github_login               TEXT NOT NULL COLLATE NOCASE,
  role                       TEXT NOT NULL CHECK (role IN ('admin', 'moderator', 'member', 'guest')),
  assigned_by_github_user_id INTEGER,
  created_at                 TEXT NOT NULL,
  updated_at                 TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_roles_login
  ON user_roles(github_login COLLATE NOCASE);

CREATE TABLE IF NOT EXISTS privileged_action_audit (
  id             TEXT PRIMARY KEY,
  github_user_id INTEGER,
  github_login   TEXT NOT NULL COLLATE NOCASE,
  role           TEXT NOT NULL CHECK (role IN ('admin', 'moderator', 'member', 'guest')),
  action         TEXT NOT NULL,
  target_type    TEXT,
  target_id      TEXT,
  outcome        TEXT NOT NULL CHECK (outcome IN ('accepted', 'succeeded', 'failed', 'rejected')),
  created_at     TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_privileged_action_audit_created
  ON privileged_action_audit(created_at DESC);

-- Initial administrator: https://github.com/humor4fun
INSERT OR IGNORE INTO user_roles (
  github_user_id, github_login, role, assigned_by_github_user_id, created_at, updated_at
) VALUES (
  7505051, 'humor4fun', 'admin', 7505051,
  '2026-09-02T00:00:00.000Z', '2026-09-02T00:00:00.000Z'
);
