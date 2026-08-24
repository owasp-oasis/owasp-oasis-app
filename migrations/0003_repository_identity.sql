-- Use GitHub's immutable repository ID for repository relationships.
-- Names remain display data and may be reused after a repository is removed.
PRAGMA defer_foreign_keys = ON;

CREATE TABLE repos_by_github_id (
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

INSERT INTO repos_by_github_id (
  id, name, full_name, description, language, open_prs,
  duplicate_count, stars, upstream_url, synced_at
)
SELECT
  id, name, full_name, description, language, open_prs,
  duplicate_count, stars, upstream_url, synced_at
FROM repos;

-- These repositories were removed from the active repos table by the cleanup
-- that preceded this migration. Their GitHub IDs were captured while their
-- metadata still existed, so preserve those identities for historical PRs.
INSERT OR IGNORE INTO repos_by_github_id (id, name, full_name, active)
SELECT 1204459167, 'kafka', 'owasp-oasis/kafka', 0
WHERE EXISTS (SELECT 1 FROM pull_requests WHERE repo_name = 'kafka');

INSERT OR IGNORE INTO repos_by_github_id (id, name, full_name, active)
SELECT 1206298792, 'openclaw', 'owasp-oasis/openclaw', 0
WHERE EXISTS (SELECT 1 FROM pull_requests WHERE repo_name = 'openclaw');

INSERT OR IGNORE INTO repos_by_github_id (id, name, full_name, active)
SELECT 1204458384, 'react_old', 'owasp-oasis/react_old', 0
WHERE EXISTS (SELECT 1 FROM pull_requests WHERE repo_name = 'react_old');

DROP TABLE repos;
ALTER TABLE repos_by_github_id RENAME TO repos;

CREATE UNIQUE INDEX idx_repos_active_name ON repos(name) WHERE active = 1;

CREATE TABLE pull_requests_by_repo_id (
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

INSERT INTO pull_requests_by_repo_id (
  id, repo_id, repo_name, number, title, state, author, html_url,
  comment_count, oasis_comment_count, non_oasis_comment_count, participants,
  consensus_accept, consensus_modify, consensus_reject, consensus_duplicate,
  duplicate_of, closed_as_duplicate, merged_upstream, head_sha, merged_at,
  created_at, updated_at, detection_tool, synced_at, deleted, deleted_at
)
SELECT
  p.id,
  (SELECT r.id FROM repos r WHERE r.name = p.repo_name ORDER BY r.active DESC, r.id DESC LIMIT 1),
  p.repo_name, p.number, p.title, p.state, p.author, p.html_url,
  p.comment_count, p.oasis_comment_count, p.non_oasis_comment_count, p.participants,
  p.consensus_accept, p.consensus_modify, p.consensus_reject, p.consensus_duplicate,
  p.duplicate_of, p.closed_as_duplicate, p.merged_upstream, p.head_sha, p.merged_at,
  p.created_at, p.updated_at, p.detection_tool, p.synced_at, p.deleted, p.deleted_at
FROM pull_requests p;

DROP TABLE pull_requests;
ALTER TABLE pull_requests_by_repo_id RENAME TO pull_requests;

CREATE INDEX idx_pull_requests_repo_current ON pull_requests(repo_id, deleted);

PRAGMA defer_foreign_keys = OFF;
