-- Team badge settings and durable earned badge records.
CREATE TABLE IF NOT EXISTS team_badge_settings (
  team_id                  INTEGER PRIMARY KEY,
  contribution_threshold   INTEGER NOT NULL DEFAULT 5
                           CHECK(contribution_threshold IN (3, 5, 10, 25)),
  updated_by               TEXT NOT NULL,
  updated_at               TEXT NOT NULL,
  FOREIGN KEY (team_id) REFERENCES teams(id)
);

INSERT OR IGNORE INTO team_badge_settings (team_id, contribution_threshold, updated_by, updated_at)
SELECT id, 5, owner_login, updated_at FROM teams;

CREATE TABLE IF NOT EXISTS team_badges (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id           INTEGER NOT NULL,
  github_login      TEXT NOT NULL,
  badge_key         TEXT NOT NULL CHECK(badge_key IN ('membership', 'contributor_milestone')),
  qualifying_count  INTEGER NOT NULL DEFAULT 0,
  threshold         INTEGER,
  awarded_at        TEXT NOT NULL,
  UNIQUE(team_id, github_login, badge_key),
  FOREIGN KEY (team_id) REFERENCES teams(id)
);
CREATE INDEX IF NOT EXISTS idx_team_badges_login ON team_badges(github_login, awarded_at);
