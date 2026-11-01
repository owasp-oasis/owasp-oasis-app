-- Additive and retry-safe. No inferred interests for existing users.
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
