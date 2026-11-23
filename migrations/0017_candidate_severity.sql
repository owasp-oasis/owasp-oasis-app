-- Nullable for existing rows; the next repository sync backfills explicit values
-- in bounded PR chunks. Unknown findings remain NULL.
ALTER TABLE pull_requests ADD COLUMN severity TEXT
  CHECK (severity IS NULL OR severity IN ('low', 'medium', 'high', 'critical'));
