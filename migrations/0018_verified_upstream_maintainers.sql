-- Verified GitHub maintainers registered against an OASIS fork.
-- GitHub access remains external; this table records the OASIS relationship.
CREATE TABLE IF NOT EXISTS verified_upstream_maintainers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  oasis_repo_id INTEGER NOT NULL,
  upstream_repo_github_id INTEGER NOT NULL,
  upstream_full_name TEXT NOT NULL,
  github_user_id INTEGER NOT NULL,
  github_login TEXT NOT NULL,
  github_permission TEXT NOT NULL CHECK (github_permission IN ('maintain', 'admin')),
  verified_at TEXT NOT NULL,
  removed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (oasis_repo_id) REFERENCES repos(id),
  UNIQUE(oasis_repo_id, github_user_id)
);

CREATE INDEX IF NOT EXISTS idx_verified_maintainers_active
  ON verified_upstream_maintainers(oasis_repo_id, removed_at, github_user_id);
