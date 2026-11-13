-- OASIS stewardship requests and repo-specific role assignments.
-- GitHub permissions remain independent; these tables record OASIS roles only.
CREATE TABLE IF NOT EXISTS repository_stewards (
  oasis_repo_id INTEGER PRIMARY KEY,
  github_user_id INTEGER NOT NULL,
  github_login TEXT NOT NULL COLLATE NOCASE,
  github_name TEXT,
  assigned_by_github_user_id INTEGER NOT NULL,
  assigned_by_login TEXT NOT NULL COLLATE NOCASE,
  assigned_at TEXT NOT NULL,
  FOREIGN KEY (oasis_repo_id) REFERENCES repos(id)
);

CREATE TABLE IF NOT EXISTS repository_stewardship_requests (
  id TEXT PRIMARY KEY,
  oasis_repo_id INTEGER NOT NULL,
  requester_github_user_id INTEGER NOT NULL,
  requester_login TEXT NOT NULL COLLATE NOCASE,
  requester_name TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'declined')),
  reviewed_by_github_user_id INTEGER,
  reviewed_by_login TEXT COLLATE NOCASE,
  requested_at TEXT NOT NULL,
  reviewed_at TEXT,
  FOREIGN KEY (oasis_repo_id) REFERENCES repos(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_repo_stewardship_one_pending
  ON repository_stewardship_requests(oasis_repo_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_repo_stewardship_requester
  ON repository_stewardship_requests(requester_github_user_id, requested_at DESC);

CREATE TABLE IF NOT EXISTS repository_role_assignments (
  id TEXT PRIMARY KEY,
  oasis_repo_id INTEGER NOT NULL,
  github_user_id INTEGER NOT NULL,
  github_login TEXT NOT NULL COLLATE NOCASE,
  github_name TEXT,
  role_name TEXT NOT NULL COLLATE NOCASE,
  role_description TEXT NOT NULL DEFAULT '',
  assigned_by_github_user_id INTEGER NOT NULL,
  assigned_by_login TEXT NOT NULL COLLATE NOCASE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (oasis_repo_id) REFERENCES repos(id),
  CHECK (length(role_name) BETWEEN 2 AND 80)
);
