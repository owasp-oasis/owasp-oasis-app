-- Community Teams. This migration is additive and safe to apply once.
ALTER TABLE user_votes ADD COLUMN team_id INTEGER DEFAULT NULL;

CREATE TABLE IF NOT EXISTS teams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  membership_mode TEXT NOT NULL DEFAULT 'invite_only' CHECK(membership_mode IN ('invite_only', 'request')),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'archived', 'suspended')),
  owner_login TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT,
  suspended_at TEXT
);

CREATE TABLE IF NOT EXISTS team_memberships (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id INTEGER NOT NULL,
  github_login TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('owner', 'admin', 'member')),
  joined_at TEXT NOT NULL,
  left_at TEXT,
  left_reason TEXT,
  FOREIGN KEY (team_id) REFERENCES teams(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_team_memberships_current ON team_memberships(team_id, github_login) WHERE left_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_team_memberships_login ON team_memberships(github_login, left_at);

CREATE TABLE IF NOT EXISTS team_invites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id INTEGER NOT NULL,
  invitee_login TEXT NOT NULL,
  invited_by TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'accepted', 'declined', 'revoked')),
  created_at TEXT NOT NULL,
  resolved_at TEXT,
  FOREIGN KEY (team_id) REFERENCES teams(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_team_invites_pending ON team_invites(team_id, invitee_login) WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS team_join_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id INTEGER NOT NULL,
  requester_login TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'accepted', 'declined', 'cancelled')),
  created_at TEXT NOT NULL,
  resolved_by TEXT,
  resolved_at TEXT,
  FOREIGN KEY (team_id) REFERENCES teams(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_team_join_requests_pending ON team_join_requests(team_id, requester_login) WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS team_repositories (
  team_id INTEGER NOT NULL,
  repo_id INTEGER NOT NULL,
  added_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (team_id, repo_id),
  FOREIGN KEY (team_id) REFERENCES teams(id),
  FOREIGN KEY (repo_id) REFERENCES repos(id)
);

CREATE TABLE IF NOT EXISTS team_ownership_transfers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id INTEGER NOT NULL,
  proposed_owner TEXT NOT NULL,
  proposed_by TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'accepted', 'declined', 'cancelled')),
  created_at TEXT NOT NULL,
  resolved_at TEXT,
  FOREIGN KEY (team_id) REFERENCES teams(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_team_ownership_transfers_pending ON team_ownership_transfers(team_id) WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_user_votes_team ON user_votes(team_id, voted_at);
