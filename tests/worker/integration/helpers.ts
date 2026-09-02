/**
 * Integration test helpers: D1 schema setup, session/CSRF generation, test data factories.
 * 
 * CORS Limitation (localhost in tests):
 * Integration tests run under SELF.fetch() with url = http://localhost/...
 * The ALLOWED_ORIGINS list (in security.ts) only includes production/preview HTTPS domains.
 * Tests do NOT receive CORS headers (Access-Control-Allow-Origin, etc.).
 * This is acceptable because:
 *   1. Tests validate JSON payloads, not CORS behavior
 *   2. CORS behavior is tested explicitly in router.test.ts by passing valid Origin headers
 *   3. The CORS limitation is documented here for future maintainers
 */

import type { Env } from '../../../worker/types.js';
import { encryptToken } from '../../../worker/security.js';

// ─── SCHEMA SETUP ────────────────────────────────────────────────

/**
 * Applies the full D1 schema to the test database.
 * Must be called in beforeAll() or beforeEach() depending on isolation mode.
 */
export async function applySchema(env: Env): Promise<void> {
  const schema = `
-- Registrations and applications
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

CREATE INDEX IF NOT EXISTS idx_registrations_email  ON registrations(email);
CREATE INDEX IF NOT EXISTS idx_registrations_github ON registrations(github);
CREATE INDEX IF NOT EXISTS idx_applications_email   ON applications(email);
CREATE INDEX IF NOT EXISTS idx_applications_role    ON applications(role);

CREATE TABLE IF NOT EXISTS hubspot_sync_queue (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  source_type     TEXT NOT NULL CHECK(source_type IN ('registration', 'application')),
  source_key      TEXT NOT NULL,
  payload_json    TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'processing', 'synced')),
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

-- Leaderboard tables
CREATE TABLE IF NOT EXISTS repos (
  id              INTEGER PRIMARY KEY,
  name            TEXT NOT NULL,
  full_name       TEXT NOT NULL,
  description     TEXT,
  language        TEXT,
  open_prs        INTEGER DEFAULT 0,
  duplicate_count INTEGER DEFAULT 0,
  stars           INTEGER DEFAULT 0,
  upstream_url    TEXT,
  active          INTEGER NOT NULL DEFAULT 1,
  synced_at       TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_repos_active_name ON repos(name) WHERE active = 1;

CREATE TABLE IF NOT EXISTS pull_requests (
  id                      INTEGER PRIMARY KEY,
  repo_id                 INTEGER,
  repo_name               TEXT NOT NULL,
  number                  INTEGER NOT NULL,
  title                   TEXT NOT NULL,
  state                   TEXT NOT NULL DEFAULT 'open',
  author                  TEXT,
  html_url                TEXT,
  comment_count           INTEGER DEFAULT 0,
  oasis_comment_count     INTEGER DEFAULT 0,
  non_oasis_comment_count INTEGER DEFAULT 0,
  participants            INTEGER DEFAULT 0,
  consensus_accept        INTEGER DEFAULT 0,
  consensus_modify        INTEGER DEFAULT 0,
  consensus_reject        INTEGER DEFAULT 0,
  consensus_duplicate     INTEGER DEFAULT 0,
  duplicate_of            INTEGER DEFAULT NULL,
  closed_as_duplicate     INTEGER DEFAULT 0,
  merged_upstream         INTEGER DEFAULT 0,
  head_sha                TEXT,
  merged_at               TEXT,
  created_at              TEXT,
  updated_at              TEXT,
  detection_tool          TEXT,
  synced_at               TEXT,
  deleted                 INTEGER DEFAULT 0,
  deleted_at              TEXT,
  UNIQUE(repo_id, number),
  FOREIGN KEY (repo_id) REFERENCES repos(id)
);

CREATE INDEX IF NOT EXISTS idx_pull_requests_repo_current ON pull_requests(repo_id, deleted);

CREATE TABLE IF NOT EXISTS contributors (
  login                  TEXT PRIMARY KEY,
  avatar_url             TEXT,
  prs_worked             INTEGER DEFAULT 0,
  total_interactions     INTEGER DEFAULT 0,
  non_oasis_interactions INTEGER DEFAULT 0,
  reactions_received     INTEGER DEFAULT 0,
  reactions_given        INTEGER DEFAULT 0,
  accepts                INTEGER DEFAULT 0,
  modifies               INTEGER DEFAULT 0,
  rejects                INTEGER DEFAULT 0,
  duplicates             INTEGER DEFAULT 0,
  comment_score          REAL    DEFAULT 0,
  peer_score             REAL    DEFAULT 0,
  reaction_score         REAL    DEFAULT 0,
  trust_score            REAL    DEFAULT 0,
  base_reputation        REAL    DEFAULT 0,
  modified_reputation    REAL    DEFAULT 0,
  rank_90d               INTEGER,
  rank_90d_oldest_activity TEXT,
  synced_at              TEXT
);

CREATE TABLE IF NOT EXISTS pr_comments (
  id            INTEGER PRIMARY KEY,
  pr_id         INTEGER NOT NULL,
  repo_name     TEXT    NOT NULL,
  pr_number     INTEGER NOT NULL,
  login         TEXT    NOT NULL,
  decision      TEXT,
  duplicate_of  INTEGER DEFAULT NULL,
  created_at    TEXT    NOT NULL,
  pr_created_at TEXT    NOT NULL,
  FOREIGN KEY (pr_id) REFERENCES pull_requests(id)
);

CREATE TABLE IF NOT EXISTS comment_reactions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  comment_id  INTEGER NOT NULL,
  reactor     TEXT    NOT NULL,
  content     TEXT    NOT NULL,
  is_positive INTEGER NOT NULL,
  UNIQUE(comment_id, reactor, content),
  FOREIGN KEY (comment_id) REFERENCES pr_comments(id)
);

CREATE INDEX IF NOT EXISTS idx_pr_comments_login        ON pr_comments(login);
CREATE INDEX IF NOT EXISTS idx_pr_comments_created_at   ON pr_comments(created_at);
CREATE INDEX IF NOT EXISTS idx_pr_comments_pr_id        ON pr_comments(pr_id);
CREATE INDEX IF NOT EXISTS idx_comment_reactions_comment ON comment_reactions(comment_id);
CREATE INDEX IF NOT EXISTS idx_comment_reactions_reactor ON comment_reactions(reactor);

CREATE TABLE IF NOT EXISTS pr_participants (
  pr_id                  INTEGER NOT NULL,
  repo_name              TEXT NOT NULL,
  pr_number              INTEGER NOT NULL,
  login                  TEXT NOT NULL,
  interactions           INTEGER DEFAULT 0,
  non_oasis_interactions INTEGER DEFAULT 0,
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
INSERT OR IGNORE INTO sync_state (key, value) VALUES ('canonical_sync_enabled', '0');
INSERT OR IGNORE INTO sync_state (key, value) VALUES ('canonical_pipeline_run_id', '');
INSERT OR IGNORE INTO sync_state (key, value) VALUES ('canonical_pipeline_phase', 'idle');
INSERT OR IGNORE INTO sync_state (key, value) VALUES ('canonical_pipeline_updated_at', '2020-01-01T00:00:00Z');

CREATE TABLE IF NOT EXISTS sync_pipeline_locks (
  lock_key TEXT PRIMARY KEY, pipeline_run_id TEXT NOT NULL, acquired_at TEXT NOT NULL,
  lease_expires_at TEXT NOT NULL
);

-- Auth tables
CREATE TABLE IF NOT EXISTS user_sessions (
  session_id     TEXT PRIMARY KEY,
  github_user_id INTEGER,
  github_login   TEXT NOT NULL,
  avatar_url     TEXT,
  created_at     TEXT NOT NULL,
  expires_at     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_roles (
  github_user_id INTEGER PRIMARY KEY,
  github_login TEXT NOT NULL COLLATE NOCASE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'moderator', 'member', 'guest')),
  assigned_by_github_user_id INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_roles_login ON user_roles(github_login COLLATE NOCASE);

CREATE TABLE IF NOT EXISTS privileged_action_audit (
  id TEXT PRIMARY KEY, github_user_id INTEGER, github_login TEXT NOT NULL COLLATE NOCASE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'moderator', 'member', 'guest')),
  action TEXT NOT NULL, target_type TEXT, target_id TEXT,
  outcome TEXT NOT NULL CHECK (outcome IN ('accepted', 'succeeded', 'failed', 'rejected')),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_privileged_action_audit_created ON privileged_action_audit(created_at DESC);

INSERT OR IGNORE INTO user_roles (
  github_user_id, github_login, role, assigned_by_github_user_id, created_at, updated_at
) VALUES (7505051, 'humor4fun', 'admin', 7505051, '2026-09-02T00:00:00.000Z', '2026-09-02T00:00:00.000Z');

CREATE TABLE IF NOT EXISTS user_preferences (
  github_login         TEXT PRIMARY KEY,
  languages            TEXT,
  severities           TEXT,
  experience           TEXT,
  onboarding_version   TEXT,
  created_at           TEXT NOT NULL,
  updated_at           TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_votes (
  github_login TEXT    NOT NULL,
  pr_id        INTEGER NOT NULL,
  repo_name    TEXT    NOT NULL,
  pr_number    INTEGER NOT NULL,
  decision     TEXT    NOT NULL,
  parent_pr_id INTEGER DEFAULT NULL,
  comment_id   INTEGER,
  voted_at     TEXT    NOT NULL,
  PRIMARY KEY (github_login, pr_id)
);

CREATE INDEX IF NOT EXISTS idx_user_votes_login    ON user_votes(github_login);
CREATE INDEX IF NOT EXISTS idx_user_sessions_login ON user_sessions(github_login);
CREATE INDEX IF NOT EXISTS idx_user_sessions_github_user_id ON user_sessions(github_user_id);

CREATE TABLE IF NOT EXISTS sync_job_runs (
  id TEXT PRIMARY KEY, pipeline_run_id TEXT, workflow_instance_id TEXT,
  job_key TEXT NOT NULL, label TEXT NOT NULL, category TEXT NOT NULL,
  trigger_type TEXT NOT NULL, mode TEXT NOT NULL, status TEXT NOT NULL,
  started_at TEXT NOT NULL, finished_at TEXT, duration_ms INTEGER,
  expected_items INTEGER NOT NULL DEFAULT 0, completed_items INTEGER NOT NULL DEFAULT 0,
  failed_items INTEGER NOT NULL DEFAULT 0, metrics_json TEXT NOT NULL DEFAULT '{}',
  error_code TEXT, error_summary TEXT, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sync_job_runs_job_started ON sync_job_runs(job_key, started_at DESC);

CREATE TABLE IF NOT EXISTS sync_job_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT, job_run_id TEXT NOT NULL,
  event_type TEXT NOT NULL, entity_type TEXT, entity_id TEXT, attempt INTEGER,
  response_status INTEGER, message TEXT, details_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_work_items (
  id TEXT PRIMARY KEY, pipeline_run_id TEXT NOT NULL, job_run_id TEXT NOT NULL,
  job_key TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}', cursor TEXT, status TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0, leased_at TEXT, lease_expires_at TEXT,
  last_error_code TEXT, last_error_summary TEXT, created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL, UNIQUE(pipeline_run_id, job_key, entity_type, entity_id)
);

CREATE TABLE IF NOT EXISTS sync_shadow_entities (
  pipeline_run_id TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL,
  repository_id INTEGER, source_updated_at TEXT, fingerprint TEXT NOT NULL,
  payload_json TEXT NOT NULL, created_at TEXT NOT NULL,
  PRIMARY KEY(pipeline_run_id, entity_type, entity_id)
);

CREATE TABLE IF NOT EXISTS sync_parity_runs (
  pipeline_run_id TEXT PRIMARY KEY, canonical_cutoff_at TEXT NOT NULL,
  status TEXT NOT NULL, comparable_entities INTEGER NOT NULL DEFAULT 0,
  matched_entities INTEGER NOT NULL DEFAULT 0, changed_during_run INTEGER NOT NULL DEFAULT 0,
  difference_count INTEGER NOT NULL DEFAULT 0, consecutive_matches INTEGER NOT NULL DEFAULT 0,
  eligible_for_cutover INTEGER NOT NULL DEFAULT 0, compared_at TEXT, created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_parity_differences (
  id INTEGER PRIMARY KEY AUTOINCREMENT, pipeline_run_id TEXT NOT NULL,
  entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, difference_type TEXT NOT NULL,
  fields_json TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_daily_budgets (
  budget_date TEXT NOT NULL, budget_key TEXT NOT NULL, label TEXT NOT NULL,
  unit TEXT NOT NULL, configured_limit INTEGER, consumed INTEGER NOT NULL DEFAULT 0,
  reserved INTEGER NOT NULL DEFAULT 0, deferred INTEGER NOT NULL DEFAULT 0,
  remaining INTEGER, reset_at TEXT, updated_at TEXT NOT NULL,
  PRIMARY KEY(budget_date, budget_key)
);
  `;

  // Split by semicolon and execute each statement
  for (const stmt of schema.split(';').map(s => s.trim()).filter(Boolean)) {
    await env.DB.prepare(stmt).run();
  }
}

// ─── DATABASE CLEANUP ────────────────────────────────────────────

/**
 * Deletes all rows from all tables (for per-test isolation).
 * Use in beforeEach() to ensure clean state between tests.
 */
export async function cleanDB(env: Env): Promise<void> {
  const tables = [
    'sync_parity_differences',
    'sync_parity_runs',
    'sync_shadow_entities',
    'sync_work_items',
    'sync_job_events',
    'sync_job_runs',
    'sync_daily_budgets',
    'sync_pipeline_locks',
    'hubspot_sync_queue',
    'user_votes',
    'user_preferences',
    'user_sessions',
    'privileged_action_audit',
    'comment_reactions',
    'pr_comments',
    'pr_participants',
    'pull_requests',
    'contributors',
    'repos',
    'registrations',
    'applications',
  ];

  // Batch delete all rows
  const stmts = tables.map(table => `DELETE FROM ${table}`);
  await env.DB.prepare(stmts.join('; ')).run();

  await env.DB.prepare(`
    DELETE FROM user_roles;
    INSERT INTO user_roles (
      github_user_id, github_login, role, assigned_by_github_user_id, created_at, updated_at
    ) VALUES (7505051, 'humor4fun', 'admin', 7505051, '2026-09-02T00:00:00.000Z', '2026-09-02T00:00:00.000Z');
  `).run();

  // Reset sync_state to defaults
  await env.DB.prepare(`
    DELETE FROM sync_state;
    INSERT INTO sync_state (key, value) VALUES
      ('last_synced_at', '2020-01-01T00:00:00Z'),
      ('sync_running', '0'),
      ('last_manual_sync', '2020-01-01T00:00:00Z'),
      ('canonical_sync_enabled', '0'),
      ('canonical_pipeline_run_id', ''),
      ('canonical_pipeline_phase', 'idle'),
      ('canonical_pipeline_updated_at', '2020-01-01T00:00:00Z');
  `).run();

  const rateLimitKeys = await env.RATE_KV.list();
  await Promise.all(rateLimitKeys.keys.map(key => env.RATE_KV.delete(key.name)));
}

// ─── SETUP MODES ────────────────────────────────────────────────

/**
 * Full per-test isolation: applies schema once, then clears DB before each test.
 * Use this for thorough test coverage (default mode).
 */
export async function setupFull(env: Env): Promise<() => Promise<void>> {
  await applySchema(env);
  return () => cleanDB(env);
}

/**
 * Per-file isolation: applies schema once, no per-test cleanup.
 * Use this for faster test runs when test independence is guaranteed.
 */
export async function setupFast(env: Env): Promise<void> {
  await applySchema(env);
}

// ─── SESSION AND AUTH HELPERS ────────────────────────────────────

/**
 * Generates a valid 64-character CSRF token.
 */
export function makeCsrf(): string {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Creates a test session and returns the session + gh_token cookies as strings.
 * The token is encrypted using env.TOKEN_ENCRYPTION_KEY.
 */
export async function createTestSession(
  env: Env,
  overrides?: {
    session_id?: string;
    github_user_id?: number | null;
    github_login?: string;
    avatar_url?: string | null;
    github_token?: string;
  },
): Promise<{ sessionCookie: string; tokenCookie: string; sessionId: string; login: string }> {
  const session_id = overrides?.session_id ?? makeCsrf();
  const github_login = overrides?.github_login ?? 'test-user';
  const github_user_id = overrides?.github_user_id ?? null;
  const avatar_url = overrides?.avatar_url ?? 'https://avatars.githubusercontent.com/u/1?v=4';
  const github_token = overrides?.github_token ?? 'test-token';

  const now = new Date().toISOString();
  const expires_at = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  // Insert session into DB
  await env.DB.prepare(`
    INSERT INTO user_sessions (session_id, github_user_id, github_login, avatar_url, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(session_id, github_user_id, github_login, avatar_url, now, expires_at).run();

  // Encrypt token
  const encryptedToken = await encryptToken(env.TOKEN_ENCRYPTION_KEY, github_token);

  // Return cookies as Set-Cookie formatted strings
  const sessionCookie = `__session=${session_id}; Path=/; HttpOnly; Secure; SameSite=Strict`;
  const tokenCookie = `__gh_token=${encryptedToken}; Path=/api; HttpOnly; Secure; SameSite=Strict`;

  return { sessionCookie, tokenCookie, sessionId: session_id, login: github_login };
}

/**
 * Builds a cookie header string from an array of cookie values.
 */
export function buildCookieHeader(...cookies: string[]): string {
  // Extract just the key=value part from Set-Cookie formatted strings
  return cookies
    .map(c => c.split(';')[0]) // Take only the first part before the semicolon
    .join('; ');
}

// ─── TEST DATA FACTORIES ────────────────────────────────────────

/**
 * Inserts a test repo into the database.
 */
export async function insertTestRepo(
  env: Env,
  overrides?: {
    id?: number;
    name?: string;
    language?: string | null;
    open_prs?: number;
  },
): Promise<{ id: number; name: string }> {
  const name = overrides?.name ?? 'test-repo';
  const derivedId = Array.from(name).reduce((hash, char) => ((hash * 31) + char.charCodeAt(0)) >>> 0, 7);
  const id = overrides?.id ?? derivedId;
  const language = overrides?.language ?? 'Python';
  const open_prs = overrides?.open_prs ?? 0;

  await env.DB.prepare(`
    INSERT INTO repos (id, name, full_name, language, open_prs, synced_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(id, name, `owasp-oasis/${name}`, language, open_prs, new Date().toISOString()).run();

  return { id, name };
}

/**
 * Inserts a test PR into the database.
 */
export async function insertTestPR(
  env: Env,
  overrides?: {
    id?: number;
    repo_name?: string;
    repo_id?: number;
    number?: number;
    title?: string;
    state?: 'open' | 'closed';
  },
): Promise<{ id: number; repo_name: string; number: number }> {
  const id = overrides?.id ?? 1001;
  const repo_name = overrides?.repo_name ?? 'test-repo';
  const number = overrides?.number ?? 1;
  let repoRow = await env.DB.prepare(
    'SELECT id FROM repos WHERE name = ? AND active = 1 ORDER BY id DESC LIMIT 1',
  ).bind(repo_name).first<{ id: number }>();
  if (!repoRow && overrides?.repo_id === undefined) {
    repoRow = await insertTestRepo(env, { name: repo_name });
  }
  const repo_id = overrides?.repo_id ?? repoRow?.id ?? null;
  const title = overrides?.title ?? 'CWE-89 (SQL Injection) High Severity in foo.py';
  const state = overrides?.state ?? 'open';

  const now = new Date().toISOString();

  await env.DB.prepare(`
    INSERT INTO pull_requests
    (id, repo_id, repo_name, number, title, state, html_url, created_at, updated_at, synced_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    repo_id,
    repo_name,
    number,
    title,
    state,
    `https://github.com/owasp-oasis/${repo_name}/pull/${number}`,
    now,
    now,
    now,
  ).run();

  return { id, repo_name, number };
}

/**
 * Inserts a test registration into the database.
 */
export async function insertTestRegistration(
  env: Env,
  overrides?: {
    email?: string;
    github?: string;
    role?: string;
  },
): Promise<{ email: string; github: string }> {
  const email = overrides?.email ?? 'test@oasis-test.internal';
  const github = overrides?.github ?? 'test-user';
  const role = overrides?.role ?? 'validator';

  const now = new Date().toISOString();

  await env.DB.prepare(`
    INSERT INTO registrations (name, email, github, role, ip_hash, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind('Test User', email, github, role, 'test-ip-hash', now).run();

  return { email, github };
}
