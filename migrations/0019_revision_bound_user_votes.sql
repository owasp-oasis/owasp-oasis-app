-- Preserve the immutable GitHub identity and candidate revision for each new vote.
-- Historical rows remain NULL: a vote must not be assigned to a revision that
-- cannot be proven from stored data.
ALTER TABLE user_votes ADD COLUMN github_user_id INTEGER;
ALTER TABLE user_votes ADD COLUMN head_sha TEXT;

CREATE INDEX IF NOT EXISTS idx_user_votes_pr_revision
  ON user_votes(pr_id, head_sha, decision);
