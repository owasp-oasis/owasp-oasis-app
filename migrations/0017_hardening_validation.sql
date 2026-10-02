-- Hardening is a distinct reviewer decision, not an Accept/Modify/Reject vote.
-- Historical consensus is unchanged; the new count starts at zero.
ALTER TABLE pull_requests ADD COLUMN consensus_hardening INTEGER NOT NULL DEFAULT 0
  CHECK (consensus_hardening >= 0);
