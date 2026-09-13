-- Maintainer decisions and upstream PR linkage are intentionally separate from
-- validator votes and contributor reputation. They describe the disposition of
-- a candidate fix; they do not change scoring inputs.

CREATE TABLE IF NOT EXISTS maintainer_decisions (
  id                 TEXT PRIMARY KEY,
  pr_id              INTEGER NOT NULL,
  decision           TEXT NOT NULL CHECK(decision IN ('changes_requested', 'accepted', 'declined')),
  reason             TEXT NOT NULL,
  head_sha           TEXT,
  github_user_id     INTEGER,
  github_login       TEXT NOT NULL,
  created_at         TEXT NOT NULL,
  FOREIGN KEY (pr_id) REFERENCES pull_requests(id)
);

CREATE INDEX IF NOT EXISTS idx_maintainer_decisions_pr_created
  ON maintainer_decisions(pr_id, created_at DESC);

CREATE TABLE IF NOT EXISTS upstream_submissions (
  id                       TEXT PRIMARY KEY,
  source_pr_id             INTEGER NOT NULL,
  upstream_full_name       TEXT NOT NULL,
  upstream_default_branch  TEXT NOT NULL,
  upstream_pr_id           INTEGER,
  upstream_pr_number       INTEGER,
  upstream_pr_node_id      TEXT,
  upstream_pr_url          TEXT,
  head_repo_full_name      TEXT NOT NULL,
  head_branch              TEXT NOT NULL,
  validated_head_sha       TEXT NOT NULL,
  base_branch              TEXT NOT NULL,
  status                   TEXT NOT NULL CHECK(status IN ('pending', 'open', 'changes_requested', 'merged', 'closed', 'failed')),
  close_reason             TEXT,
  close_reason_text        TEXT,
  last_review_state        TEXT,
  last_reviewed_by         TEXT,
  last_reviewed_at         TEXT,
  last_review_url           TEXT,
  submitted_by_github_id   INTEGER,
  submitted_by_login       TEXT NOT NULL,
  submitted_at             TEXT,
  last_synced_at           TEXT,
  error_summary            TEXT,
  created_at               TEXT NOT NULL,
  updated_at               TEXT NOT NULL,
  FOREIGN KEY (source_pr_id) REFERENCES pull_requests(id)
);

CREATE INDEX IF NOT EXISTS idx_upstream_submissions_source_updated
  ON upstream_submissions(source_pr_id, updated_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_upstream_submissions_active_source
  ON upstream_submissions(source_pr_id)
  WHERE status IN ('pending', 'open', 'changes_requested');

CREATE UNIQUE INDEX IF NOT EXISTS idx_upstream_submissions_external_pr
  ON upstream_submissions(upstream_full_name, upstream_pr_number)
  WHERE upstream_pr_number IS NOT NULL;
