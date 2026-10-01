-- Durable receipt: successful delivery is checkpointed before CRM tracking.
-- A sending/uncertain receipt is never automatically resent after an ambiguous outcome.
CREATE TABLE IF NOT EXISTS welcome_email_deliveries (
  email_hash TEXT NOT NULL,
  environment TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending', 'sending', 'sent', 'tracked', 'uncertain')),
  sent_at TEXT,
  tracked_at TEXT,
  last_error TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (email_hash, environment)
);
