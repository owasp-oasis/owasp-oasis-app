-- Preserve removed Repo Role assignments as attributable history.
ALTER TABLE repository_role_assignments ADD COLUMN removed_at TEXT;
ALTER TABLE repository_role_assignments ADD COLUMN removed_by_github_user_id INTEGER;
ALTER TABLE repository_role_assignments ADD COLUMN removed_by_login TEXT COLLATE NOCASE;

CREATE INDEX IF NOT EXISTS idx_repository_role_assignments_repo
  ON repository_role_assignments(oasis_repo_id, role_name COLLATE NOCASE, removed_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_repository_role_assignments_active_unique
  ON repository_role_assignments(oasis_repo_id, github_user_id, role_name COLLATE NOCASE)
  WHERE removed_at IS NULL;
