-- Additive; safe to reapply. Reverting the UI can leave this table intact.
CREATE TABLE IF NOT EXISTS workspace_preferences (
  github_login TEXT PRIMARY KEY,
  settings TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(settings)),
  updated_at TEXT NOT NULL
);
