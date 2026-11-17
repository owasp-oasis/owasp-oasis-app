-- Use the verified GitHub profile display name in the shared repo roster.
ALTER TABLE verified_upstream_maintainers ADD COLUMN github_name TEXT;
