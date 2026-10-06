-- Optional human-selected answers beneath the existing A/M/R/D validation.
-- NULL means no answer was recorded, including all historical validations.
ALTER TABLE user_votes ADD COLUMN vulnerability_assessment TEXT
  CHECK (vulnerability_assessment IN ('yes', 'no', 'hardening', 'not_enough_information', 'duplicate'));
ALTER TABLE user_votes ADD COLUMN introduced_vulnerability TEXT
  CHECK (introduced_vulnerability IN ('yes', 'no', 'unknown'));
ALTER TABLE user_votes ADD COLUMN security_issue_addressed TEXT
  CHECK (security_issue_addressed IN ('yes', 'no', 'needs_modification', 'not_enough_information'));
ALTER TABLE user_votes ADD COLUMN breaks_codebase TEXT
  CHECK (breaks_codebase IN ('yes', 'no', 'unknown'));

ALTER TABLE pr_comments ADD COLUMN vulnerability_assessment TEXT
  CHECK (vulnerability_assessment IN ('yes', 'no', 'hardening', 'not_enough_information', 'duplicate'));
ALTER TABLE pr_comments ADD COLUMN introduced_vulnerability TEXT
  CHECK (introduced_vulnerability IN ('yes', 'no', 'unknown'));
ALTER TABLE pr_comments ADD COLUMN security_issue_addressed TEXT
  CHECK (security_issue_addressed IN ('yes', 'no', 'needs_modification', 'not_enough_information'));
ALTER TABLE pr_comments ADD COLUMN breaks_codebase TEXT
  CHECK (breaks_codebase IN ('yes', 'no', 'unknown'));
