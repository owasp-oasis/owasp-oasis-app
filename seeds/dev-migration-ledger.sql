-- schema.sql is the current schema snapshot. Mark the migrations represented
-- by that snapshot so a fresh local database can apply only future migrations.
-- Keep this list aligned with schema.sql and the migrations directory.
CREATE TABLE IF NOT EXISTS d1_migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE,
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

INSERT OR IGNORE INTO d1_migrations (name) VALUES
  ('0001_hubspot_sync_outbox.sql'),
  ('0002_user_preferences.sql'),
  ('0003_repository_identity.sql'),
  ('0004_canonicalise_bandit_tool.sql'),
  ('0005_attribute_legacy_sast_to_opengrep.sql'),
  ('0006_rename_semgrep_ce.sql'),
  ('0007_sync_job_observability.sql'),
  ('0007_teams.sql'),
  ('0008_bounded_canonical_sync.sql'),
  ('0008_team_logos.sql'),
  ('0009_team_badges.sql'),
  ('0009_user_roles.sql'),
  ('0010_admin_analytics.sql'),
  ('0010_public_team_badges.sql'),
  ('0011_historical_analytics_backfill.sql'),
  ('0011_team_media.sql'),
  ('0012_promote_canonical_sync.sql'),
  ('0013_response_badges.sql'),
  ('0014_maintainer_upstream_workflow.sql'),
  ('0015_retire_shadow_sync.sql'),
  ('0016_workspace_preferences.sql'),
  ('0017_validation_assessment_answers.sql');
