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
  reactions_given        INTEGER DEFAULT 0,  -- reactions contributor GAVE on other people's OASIS comments
  accepts                INTEGER DEFAULT 0,
  modifies               INTEGER DEFAULT 0,
  rejects                INTEGER DEFAULT 0,
  -- Reputation score components (pre-computed at sync time by rebuildContributors)
  comment_score          REAL    DEFAULT 0,  -- count of OASIS comments posted
  peer_score             REAL    DEFAULT 0,  -- peer agreement score from reactions received
  reaction_score         REAL    DEFAULT 0,  -- score for giving reactions (capped at 5 × 0.25)
  trust_score            REAL    DEFAULT 0,  -- 10× PRs accepted that merged upstream
  base_reputation        REAL    DEFAULT 0,  -- comment_score + peer_score + reaction_score + trust_score
  modified_reputation    REAL    DEFAULT 0,  -- base_reputation × (1 + bonus factors)
  -- 90-day leaderboard (updated each cron sync)
  rank_90d               INTEGER,            -- position in 90-day reputation leaderboard (NULL = no 90d activity)
  rank_90d_oldest_activity TEXT,             -- ISO-8601: oldest activity in current 90-day window
  synced_at              TEXT
);

-- ── Per-comment and per-reaction granular data ───────────────────────────────────────────────
-- pr_comments: one row per OASIS-template comment posted on any tracked PR
-- Used for: bonus factor computation (early-mover, early-bird, influencer), contribution history
CREATE TABLE IF NOT EXISTS pr_comments (
  id            INTEGER PRIMARY KEY,   -- GitHub comment ID
  pr_id         INTEGER NOT NULL,
  repo_name     TEXT    NOT NULL,
  pr_number     INTEGER NOT NULL,
  login         TEXT    NOT NULL,
  decision      TEXT,                  -- 'accept'|'modify'|'reject'|NULL
  created_at    TEXT    NOT NULL,      -- ISO-8601: when the comment was posted
  pr_created_at TEXT    NOT NULL,      -- ISO-8601: when the PR was created (denorm, for bonus calc)
  FOREIGN KEY (pr_id) REFERENCES pull_requests(id)
);

-- comment_reactions: one row per reaction on an OASIS-template comment
-- Used for: peer_score (reactions received), reaction_score (reactions given)
CREATE TABLE IF NOT EXISTS comment_reactions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  comment_id  INTEGER NOT NULL,        -- FK → pr_comments.id
  reactor     TEXT    NOT NULL,        -- GitHub login of person who reacted
  content     TEXT    NOT NULL,        -- '+1', '-1', 'heart', 'hooray', 'rocket', 'laugh', 'confused', etc.
  is_positive INTEGER NOT NULL,        -- 1 = positive reaction, 0 = negative reaction
  FOREIGN KEY (comment_id) REFERENCES pr_comments(id)
);

CREATE INDEX IF NOT EXISTS idx_pr_comments_login        ON pr_comments(login);
CREATE INDEX IF NOT EXISTS idx_pr_comments_created_at   ON pr_comments(created_at);
CREATE INDEX IF NOT EXISTS idx_pr_comments_pr_id        ON pr_comments(pr_id);
CREATE INDEX IF NOT EXISTS idx_comment_reactions_comment ON comment_reactions(comment_id);
CREATE INDEX IF NOT EXISTS idx_comment_reactions_reactor ON comment_reactions(reactor);

-- ── ALTER statements for existing databases ──────────────────────────────────────────────────
-- Run these on any D1 database created before the pr_comments/comment_reactions tables were added.
-- Safe to run multiple times (SQLite ignores ADD COLUMN if column already exists... actually it errors,
-- so run each only once or wrap in a migration script).
--
-- ALTER TABLE contributors ADD COLUMN reactions_given           INTEGER DEFAULT 0;
-- ALTER TABLE contributors ADD COLUMN comment_score             REAL    DEFAULT 0;
-- ALTER TABLE contributors ADD COLUMN peer_score                REAL    DEFAULT 0;
-- ALTER TABLE contributors ADD COLUMN reaction_score            REAL    DEFAULT 0;
-- ALTER TABLE contributors ADD COLUMN trust_score               REAL    DEFAULT 0;
-- ALTER TABLE contributors ADD COLUMN base_reputation           REAL    DEFAULT 0;
-- ALTER TABLE contributors ADD COLUMN modified_reputation       REAL    DEFAULT 0;
-- ALTER TABLE contributors ADD COLUMN rank_90d                  INTEGER;
-- ALTER TABLE contributors ADD COLUMN rank_90d_oldest_activity  TEXT;

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
