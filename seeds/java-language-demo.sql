-- Synthetic local UI fixtures for repository language classification.
-- Apply only with --local. These are not copies of production records.
INSERT INTO repos (id, name, full_name, description, language, open_prs, upstream_url, active)
VALUES
  (93001, 'xwiki-java-demo', 'owasp-oasis/xwiki-java-demo', 'Synthetic Java fixture: three review candidates', 'Java', 3, NULL, 1),
  (93002, 'ofbiz-java-demo', 'owasp-oasis/ofbiz-java-demo', 'Synthetic Java fixture: two review candidates', 'Java', 2, NULL, 1),
  (93003, 'python-language-demo', 'owasp-oasis/python-language-demo', 'Synthetic Python control: excluded by the Java filter', 'Python', 1, NULL, 1)
ON CONFLICT(id) DO UPDATE SET language = excluded.language, open_prs = excluded.open_prs;

INSERT INTO pull_requests (id, repo_id, repo_name, number, title, state, created_at, updated_at)
VALUES
  (94001, 93001, 'xwiki-java-demo', 1, 'Local Java candidate one', 'open', '2026-11-23T12:00:00Z', '2026-11-23T12:00:00Z'),
  (94002, 93001, 'xwiki-java-demo', 2, 'Local Java candidate two', 'open', '2026-11-23T12:00:00Z', '2026-11-23T12:00:00Z'),
  (94003, 93001, 'xwiki-java-demo', 3, 'Local Java candidate three', 'open', '2026-11-23T12:00:00Z', '2026-11-23T12:00:00Z'),
  (94004, 93002, 'ofbiz-java-demo', 1, 'Local Java candidate four', 'open', '2026-11-23T12:00:00Z', '2026-11-23T12:00:00Z'),
  (94005, 93002, 'ofbiz-java-demo', 2, 'Local Java candidate five', 'open', '2026-11-23T12:00:00Z', '2026-11-23T12:00:00Z'),
  (94006, 93003, 'python-language-demo', 1, 'Local Python control candidate', 'open', '2026-11-23T12:00:00Z', '2026-11-23T12:00:00Z')
ON CONFLICT(id) DO NOTHING;
