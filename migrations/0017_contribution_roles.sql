-- Additive and retry-safe. No inferred interests or assignments for existing users.
CREATE TABLE IF NOT EXISTS contribution_profiles (
  github_user_id INTEGER PRIMARY KEY,
  github_login TEXT NOT NULL,
  interests TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(interests) AND json_type(interests) = 'array'),
  other_interest TEXT NOT NULL DEFAULT '',
  interests_updated_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_contribution_profiles_login ON contribution_profiles(github_login COLLATE NOCASE);
CREATE TABLE IF NOT EXISTS registration_role_interests (
  registration_id INTEGER PRIMARY KEY REFERENCES registrations(id) ON DELETE CASCADE,
  interests TEXT NOT NULL CHECK(json_valid(interests) AND json_type(interests) = 'array'),
  other_interest TEXT NOT NULL DEFAULT '',
  claimed_by INTEGER REFERENCES contribution_profiles(github_user_id)
);
CREATE TABLE IF NOT EXISTS contribution_assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  github_user_id INTEGER NOT NULL REFERENCES contribution_profiles(github_user_id),
  repo_id INTEGER NOT NULL REFERENCES repos(id),
  role TEXT NOT NULL CHECK(role IN ('steward', 'contact')),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'ended')),
  assigned_by INTEGER NOT NULL,
  assigned_at TEXT NOT NULL,
  ended_at TEXT,
  ended_by INTEGER
);
CREATE INDEX IF NOT EXISTS idx_contribution_assignments_member ON contribution_assignments(github_user_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_contribution_active_assignment ON contribution_assignments(github_user_id, repo_id, role) WHERE status = 'active';
