-- OWASP OASIS — D1 Database Schema
-- Run with: npx wrangler d1 execute oasis-db --file=schema.sql

CREATE TABLE IF NOT EXISTS registrations (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL DEFAULT '',
  email      TEXT    NOT NULL UNIQUE,
  github     TEXT    DEFAULT '',
  role       TEXT    DEFAULT '',
  ip_hash    TEXT    NOT NULL,
  created_at TEXT    NOT NULL,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS applications (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  email      TEXT NOT NULL,
  name       TEXT NOT NULL,
  github     TEXT DEFAULT '',
  org        TEXT DEFAULT '',
  why        TEXT DEFAULT '',
  role       TEXT NOT NULL,
  ip_hash    TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT,
  UNIQUE(email, role)
);

CREATE INDEX IF NOT EXISTS idx_registrations_email ON registrations(email);
CREATE INDEX IF NOT EXISTS idx_applications_email  ON applications(email);
CREATE INDEX IF NOT EXISTS idx_applications_role   ON applications(role);

-- ── Leaderboard tables (preview/production D1 — apply via wrangler d1 execute) ──────────────
-- These tables are populated by the GitHub sync cron and /leaderboard-refresh endpoint.
-- Run each CREATE on a fresh DB; use ALTER TABLE for existing DBs.

CREATE TABLE IF NOT EXISTS repos (
  id           INTEGER PRIMARY KEY,
  name         TEXT NOT NULL UNIQUE,
  full_name    TEXT NOT NULL,
  description  TEXT,
  language     TEXT,
  open_prs     INTEGER DEFAULT 0,
  stars        INTEGER DEFAULT 0,
  upstream_url TEXT,
  synced_at    TEXT
);

CREATE TABLE IF NOT EXISTS pull_requests (
  id                      INTEGER PRIMARY KEY,
  repo_name               TEXT NOT NULL,
  number                  INTEGER NOT NULL,
  title                   TEXT NOT NULL,
  state                   TEXT NOT NULL DEFAULT 'open',
  author                  TEXT,
  html_url                TEXT,
  comment_count           INTEGER DEFAULT 0,  -- raw total comments (all types)
  oasis_comment_count     INTEGER DEFAULT 0,  -- comments matching OASIS templates
  non_oasis_comment_count INTEGER DEFAULT 0,  -- comments NOT matching OASIS templates
  participants            INTEGER DEFAULT 0,  -- count of OASIS-voting participants only
  consensus_accept        INTEGER DEFAULT 0,
  consensus_modify        INTEGER DEFAULT 0,
  consensus_reject        INTEGER DEFAULT 0,
  merged_upstream         INTEGER DEFAULT 0,
  head_sha                TEXT,
  merged_at               TEXT,
  created_at              TEXT,
  updated_at              TEXT,
  detection_tool          TEXT,
  synced_at               TEXT,
  UNIQUE(repo_name, number)
);

CREATE TABLE IF NOT EXISTS contributors (
  login                  TEXT PRIMARY KEY,
  avatar_url             TEXT,
  prs_worked             INTEGER DEFAULT 0,
  total_interactions     INTEGER DEFAULT 0,
  non_oasis_interactions INTEGER DEFAULT 0,  -- non-OASIS comments (tracked, not used in reputation)
  reactions_received     INTEGER DEFAULT 0,
  accepts                INTEGER DEFAULT 0,
  modifies               INTEGER DEFAULT 0,
  rejects                INTEGER DEFAULT 0,
  synced_at              TEXT
);

CREATE TABLE IF NOT EXISTS pr_participants (
  pr_id                  INTEGER NOT NULL,
  repo_name              TEXT NOT NULL,
  pr_number              INTEGER NOT NULL,
  login                  TEXT NOT NULL,
  interactions           INTEGER DEFAULT 0,
  non_oasis_interactions INTEGER DEFAULT 0,  -- non-OASIS comments from this participant on this PR
  decision               TEXT,
  reactions_received     INTEGER DEFAULT 0,
  PRIMARY KEY (pr_id, login)
);

CREATE TABLE IF NOT EXISTS sync_state (
  key   TEXT PRIMARY KEY,
  value TEXT
);

INSERT OR IGNORE INTO sync_state (key, value) VALUES ('last_synced_at',   '2020-01-01T00:00:00Z');
INSERT OR IGNORE INTO sync_state (key, value) VALUES ('sync_running',     '0');
INSERT OR IGNORE INTO sync_state (key, value) VALUES ('last_manual_sync', '2020-01-01T00:00:00Z');

-- ── Auth tables (OAuth sessions + per-user vote records) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_sessions (
  session_id   TEXT PRIMARY KEY,   -- 32-byte hex, HttpOnly cookie
  github_login TEXT NOT NULL,
  avatar_url   TEXT,
  github_token TEXT NOT NULL,      -- user OAuth token, never returned to browser
  created_at   TEXT NOT NULL,
  expires_at   TEXT NOT NULL       -- ISO-8601, 30 days from login
);

CREATE TABLE IF NOT EXISTS user_votes (
  github_login TEXT    NOT NULL,
  pr_id        INTEGER NOT NULL,
  repo_name    TEXT    NOT NULL,
  pr_number    INTEGER NOT NULL,
  decision     TEXT    NOT NULL,   -- 'accept' | 'modify' | 'reject'
  comment_id   INTEGER,            -- GitHub comment ID (null if GitHub post failed)
  voted_at     TEXT    NOT NULL,
  PRIMARY KEY (github_login, pr_id)
);

CREATE INDEX IF NOT EXISTS idx_user_votes_login    ON user_votes(github_login);
CREATE INDEX IF NOT EXISTS idx_user_sessions_login ON user_sessions(github_login);
