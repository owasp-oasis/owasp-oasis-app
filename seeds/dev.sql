-- OASIS Dev Seed — idempotent dummy data for local developer testing
-- Apply with: npm run db:seed
-- Or manually: wrangler d1 execute oasis-db --local --file=seeds/dev.sql

-- ── Sync state ─────────────────────────────────────────────────────────────────
INSERT OR REPLACE INTO sync_state (key, value) VALUES
  ('last_synced_at',                '2026-09-21T02:15:00.000Z'),
  ('sync_running',                  '0'),
  ('last_manual_sync',              '2026-09-20T10:00:00.000Z'),
  ('canonical_sync_enabled',        '1'),
  ('canonical_pipeline_run_id',     ''),
  ('canonical_pipeline_phase',      'idle'),
  ('canonical_pipeline_updated_at', '2026-09-21T02:15:00.000Z');

-- ── Admin dev session ──────────────────────────────────────────────────────────
-- Set this cookie in your browser to log in as the dev admin account:
--   Name:     __session
--   Value:    aaaa0000aaaa0000aaaa0000aaaa0000aaaa0000aaaa0000aaaa0000aaaa0001
--   Domain:   localhost
--   HttpOnly: true
-- No __gh_token cookie needed — admin read-only pages work without a GitHub token.
INSERT OR IGNORE INTO user_sessions (
  session_id, github_user_id, github_login, avatar_url, created_at, expires_at
) VALUES (
  'aaaa0000aaaa0000aaaa0000aaaa0000aaaa0000aaaa0000aaaa0000aaaa0001',
  9000001,
  'dev-admin',
  'https://avatars.githubusercontent.com/u/9000001',
  '2026-09-01T00:00:00.000Z',
  '2027-01-01T00:00:00.000Z'
);

INSERT OR IGNORE INTO user_roles (
  github_user_id, github_login, role, assigned_by_github_user_id, created_at, updated_at
) VALUES (
  9000001, 'dev-admin', 'admin', 9000001,
  '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z'
);

-- ── Repos ──────────────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO repos (id, name, full_name, description, language, open_prs, stars, upstream_url, active, synced_at) VALUES
  (1001, 'owasp-testing-guide',
        'owasp-oasis/owasp-testing-guide',
        'OWASP Web Security Testing Guide — community fork',
        'Markdown', 11, 342, 'https://github.com/OWASP/wstg', 1,
        '2026-09-21T02:00:00.000Z'),
  (1002, 'owasp-wstg',
        'owasp-oasis/owasp-wstg',
        'Web Security Testing Guide v5 in progress',
        'Markdown', 5, 128, 'https://github.com/OWASP/wstg', 1,
        '2026-09-21T02:00:00.000Z'),
  (1003, 'owasp-asvs',
        'owasp-oasis/owasp-asvs',
        'Application Security Verification Standard',
        'Markdown', 6, 217, 'https://github.com/OWASP/ASVS', 1,
        '2026-09-21T02:00:00.000Z'),
  (1004, 'owasp-top-ten',
        'owasp-oasis/owasp-top-ten',
        'OWASP Top Ten community contributions',
        'Markdown', 3, 89, 'https://github.com/OWASP/Top10', 1,
        '2026-09-21T02:00:00.000Z'),
  (1005, 'owasp-mstg',
        'owasp-oasis/owasp-mstg',
        'Mobile Security Testing Guide',
        'Markdown', 2, 56, 'https://github.com/OWASP/owasp-mstg', 1,
        '2026-09-21T02:00:00.000Z');

-- ── Pull requests ──────────────────────────────────────────────────────────────
-- owasp-testing-guide: 12 PRs (9 open, 2 closed, 1 recently deleted)
INSERT OR IGNORE INTO pull_requests (
  id, repo_id, repo_name, number, title, state, author, html_url,
  oasis_comment_count, participants, consensus_accept, consensus_modify,
  head_sha, created_at, updated_at, synced_at
) VALUES
  (10001, 1001, 'owasp-testing-guide', 1,
   'Fix SQL injection test descriptions', 'open', 'alice-dev',
   'https://github.com/owasp-oasis/owasp-testing-guide/pull/1',
   4, 4, 3, 1, 'abc1000000000000000000000000000000000000',
   '2026-08-10T09:00:00.000Z', '2026-09-20T14:00:00.000Z', '2026-09-21T02:00:00.000Z'),
  (10002, 1001, 'owasp-testing-guide', 2,
   'Add XSS reflected test steps', 'open', 'bob-reviewer',
   'https://github.com/owasp-oasis/owasp-testing-guide/pull/2',
   3, 3, 2, 1, 'abc2000000000000000000000000000000000000',
   '2026-08-12T10:00:00.000Z', '2026-09-19T11:00:00.000Z', '2026-09-21T02:00:00.000Z'),
  (10003, 1001, 'owasp-testing-guide', 3,
   'Update SSRF test cases for cloud environments', 'open', 'carol-security',
   'https://github.com/owasp-oasis/owasp-testing-guide/pull/3',
   2, 2, 0, 2, 'abc3000000000000000000000000000000000000',
   '2026-08-15T08:00:00.000Z', '2026-09-18T09:00:00.000Z', '2026-09-21T02:00:00.000Z'),
  (10004, 1001, 'owasp-testing-guide', 4,
   'Add XXE injection detection techniques', 'open', 'dave-coder',
   'https://github.com/owasp-oasis/owasp-testing-guide/pull/4',
   3, 3, 3, 0, 'abc4000000000000000000000000000000000000',
   '2026-08-18T11:00:00.000Z', '2026-09-17T16:00:00.000Z', '2026-09-21T02:00:00.000Z'),
  (10005, 1001, 'owasp-testing-guide', 5,
   'Improve JWT validation test methodology', 'open', 'eve-tester',
   'https://github.com/owasp-oasis/owasp-testing-guide/pull/5',
   2, 2, 1, 1, 'abc5000000000000000000000000000000000000',
   '2026-08-20T14:00:00.000Z', '2026-09-16T10:00:00.000Z', '2026-09-21T02:00:00.000Z'),
  (10006, 1001, 'owasp-testing-guide', 6,
   'Document NoSQL injection patterns', 'open', 'frank-analyst',
   'https://github.com/owasp-oasis/owasp-testing-guide/pull/6',
   2, 2, 2, 0, 'abc6000000000000000000000000000000000000',
   '2026-08-22T09:00:00.000Z', '2026-09-15T08:00:00.000Z', '2026-09-21T02:00:00.000Z'),
  (10007, 1001, 'owasp-testing-guide', 7,
   'Fix broken links in authentication section', 'open', 'grace-researcher',
   'https://github.com/owasp-oasis/owasp-testing-guide/pull/7',
   1, 1, 1, 0, 'abc7000000000000000000000000000000000000',
   '2026-08-25T12:00:00.000Z', '2026-09-14T13:00:00.000Z', '2026-09-21T02:00:00.000Z'),
  (10008, 1001, 'owasp-testing-guide', 8,
   'Add GraphQL security test cases', 'open', 'henry-hacker',
   'https://github.com/owasp-oasis/owasp-testing-guide/pull/8',
   1, 1, 0, 1, 'abc8000000000000000000000000000000000000',
   '2026-08-28T15:00:00.000Z', '2026-09-13T09:00:00.000Z', '2026-09-21T02:00:00.000Z'),
  (10009, 1001, 'owasp-testing-guide', 9,
   'Fix typos in access control chapter', 'open', 'iris-dev',
   'https://github.com/owasp-oasis/owasp-testing-guide/pull/9',
   0, 0, 0, 0, 'abc9000000000000000000000000000000000000',
   '2026-09-18T10:00:00.000Z', '2026-09-18T10:00:00.000Z', '2026-09-21T02:00:00.000Z'),
  (10010, 1001, 'owasp-testing-guide', 10,
   'Merge upstream cryptographic testing updates', 'open', 'alice-dev',
   'https://github.com/owasp-oasis/owasp-testing-guide/pull/10',
   3, 3, 1, 2, 'abc0100000000000000000000000000000000000',
   '2026-09-05T08:00:00.000Z', '2026-09-20T16:00:00.000Z', '2026-09-21T02:00:00.000Z'),
  (10011, 1001, 'owasp-testing-guide', 11,
   'Deprecate outdated Flash-based test cases', 'open', 'jack-reviewer',
   'https://github.com/owasp-oasis/owasp-testing-guide/pull/11',
   0, 0, 0, 0, 'abc1100000000000000000000000000000000000',
   '2026-09-20T09:00:00.000Z', '2026-09-20T09:00:00.000Z', '2026-09-21T02:00:00.000Z'),
  (10012, 1001, 'owasp-testing-guide', 12,
   'Fix race condition in session fixation tests', 'closed', 'bob-reviewer',
   'https://github.com/owasp-oasis/owasp-testing-guide/pull/12',
   2, 2, 0, 0, 'abc1200000000000000000000000000000000000',
   '2026-07-10T08:00:00.000Z', '2026-08-01T12:00:00.000Z', '2026-09-21T02:00:00.000Z');

-- owasp-wstg: 8 PRs (5 open, 2 merged upstream, 1 closed)
INSERT OR IGNORE INTO pull_requests (
  id, repo_id, repo_name, number, title, state, author, html_url,
  oasis_comment_count, participants, consensus_accept, consensus_modify, consensus_reject,
  head_sha, merged_at, created_at, updated_at, synced_at, merged_upstream
) VALUES
  (20001, 1002, 'owasp-wstg', 1,
   'Add IDOR test methodology section', 'open', 'carol-security',
   'https://github.com/owasp-oasis/owasp-wstg/pull/1',
   3, 3, 2, 1, 0, 'bbc1000000000000000000000000000000000000',
   NULL, '2026-08-05T09:00:00.000Z', '2026-09-19T11:00:00.000Z', '2026-09-21T02:00:00.000Z', 0),
  (20002, 1002, 'owasp-wstg', 2,
   'Improve OAuth 2.0 testing guide', 'open', 'dave-coder',
   'https://github.com/owasp-oasis/owasp-wstg/pull/2',
   2, 2, 1, 1, 0, 'bbc2000000000000000000000000000000000000',
   NULL, '2026-08-10T11:00:00.000Z', '2026-09-18T09:00:00.000Z', '2026-09-21T02:00:00.000Z', 0),
  (20003, 1002, 'owasp-wstg', 3,
   'Add API security test checklist', 'open', 'eve-tester',
   'https://github.com/owasp-oasis/owasp-wstg/pull/3',
   2, 2, 2, 0, 0, 'bbc3000000000000000000000000000000000000',
   NULL, '2026-08-15T14:00:00.000Z', '2026-09-17T16:00:00.000Z', '2026-09-21T02:00:00.000Z', 0),
  (20004, 1002, 'owasp-wstg', 4,
   'Update Kubernetes security testing section', 'open', 'frank-analyst',
   'https://github.com/owasp-oasis/owasp-wstg/pull/4',
   1, 1, 0, 1, 0, 'bbc4000000000000000000000000000000000000',
   NULL, '2026-09-01T08:00:00.000Z', '2026-09-15T10:00:00.000Z', '2026-09-21T02:00:00.000Z', 0),
  (20005, 1002, 'owasp-wstg', 5,
   'Fix markdown formatting in chapter 4', 'open', 'grace-researcher',
   'https://github.com/owasp-oasis/owasp-wstg/pull/5',
   0, 0, 0, 0, 0, 'bbc5000000000000000000000000000000000000',
   NULL, '2026-09-19T10:00:00.000Z', '2026-09-19T10:00:00.000Z', '2026-09-21T02:00:00.000Z', 0),
  (20006, 1002, 'owasp-wstg', 6,
   'Modernise TLS testing checklist for TLS 1.3', 'closed', 'henry-hacker',
   'https://github.com/owasp-oasis/owasp-wstg/pull/6',
   3, 3, 3, 0, 0, 'bbc6000000000000000000000000000000000000',
   '2026-07-20T12:00:00.000Z', '2026-07-01T09:00:00.000Z', '2026-07-20T12:00:00.000Z', '2026-09-21T02:00:00.000Z', 1),
  (20007, 1002, 'owasp-wstg', 7,
   'Add SAML assertion testing guide', 'closed', 'iris-dev',
   'https://github.com/owasp-oasis/owasp-wstg/pull/7',
   2, 2, 2, 0, 0, 'bbc7000000000000000000000000000000000000',
   '2026-08-01T12:00:00.000Z', '2026-07-15T10:00:00.000Z', '2026-08-01T12:00:00.000Z', '2026-09-21T02:00:00.000Z', 1),
  (20008, 1002, 'owasp-wstg', 8,
   'Outdated Silverlight test cases', 'closed', 'jack-reviewer',
   'https://github.com/owasp-oasis/owasp-wstg/pull/8',
   1, 1, 0, 0, 1, 'bbc8000000000000000000000000000000000000',
   NULL, '2026-06-01T09:00:00.000Z', '2026-06-20T12:00:00.000Z', '2026-09-21T02:00:00.000Z', 0);

-- owasp-asvs: 8 PRs (6 open, 1 merged, 1 closed as duplicate)
INSERT OR IGNORE INTO pull_requests (
  id, repo_id, repo_name, number, title, state, author, html_url,
  oasis_comment_count, participants, consensus_accept, consensus_modify, consensus_reject, consensus_duplicate,
  head_sha, merged_at, created_at, updated_at, synced_at, merged_upstream, duplicate_of, closed_as_duplicate
) VALUES
  (30001, 1003, 'owasp-asvs', 1,
   'Clarify V2 authentication requirements', 'open', 'alice-dev',
   'https://github.com/owasp-oasis/owasp-asvs/pull/1',
   3, 3, 2, 1, 0, 0, 'ccc1000000000000000000000000000000000000',
   NULL, '2026-08-01T09:00:00.000Z', '2026-09-20T14:00:00.000Z', '2026-09-21T02:00:00.000Z', 0, NULL, 0),
  (30002, 1003, 'owasp-asvs', 2,
   'Add V3 session management level 3 controls', 'open', 'bob-reviewer',
   'https://github.com/owasp-oasis/owasp-asvs/pull/2',
   2, 2, 1, 1, 0, 0, 'ccc2000000000000000000000000000000000000',
   NULL, '2026-08-05T10:00:00.000Z', '2026-09-19T11:00:00.000Z', '2026-09-21T02:00:00.000Z', 0, NULL, 0),
  (30003, 1003, 'owasp-asvs', 3,
   'Update V4 access control requirements', 'open', 'carol-security',
   'https://github.com/owasp-oasis/owasp-asvs/pull/3',
   3, 3, 3, 0, 0, 0, 'ccc3000000000000000000000000000000000000',
   NULL, '2026-08-10T14:00:00.000Z', '2026-09-18T09:00:00.000Z', '2026-09-21T02:00:00.000Z', 0, NULL, 0),
  (30004, 1003, 'owasp-asvs', 4,
   'Add V5 validation and sanitisation guidelines', 'open', 'dave-coder',
   'https://github.com/owasp-oasis/owasp-asvs/pull/4',
   2, 2, 2, 0, 0, 0, 'ccc4000000000000000000000000000000000000',
   NULL, '2026-08-15T08:00:00.000Z', '2026-09-17T16:00:00.000Z', '2026-09-21T02:00:00.000Z', 0, NULL, 0),
  (30005, 1003, 'owasp-asvs', 5,
   'Improve V7 error handling requirements', 'open', 'eve-tester',
   'https://github.com/owasp-oasis/owasp-asvs/pull/5',
   1, 1, 1, 0, 0, 0, 'ccc5000000000000000000000000000000000000',
   NULL, '2026-08-20T11:00:00.000Z', '2026-09-16T10:00:00.000Z', '2026-09-21T02:00:00.000Z', 0, NULL, 0),
  (30006, 1003, 'owasp-asvs', 6,
   'Add V9 communications security requirements', 'open', 'frank-analyst',
   'https://github.com/owasp-oasis/owasp-asvs/pull/6',
   1, 1, 0, 1, 0, 0, 'ccc6000000000000000000000000000000000000',
   NULL, '2026-09-10T09:00:00.000Z', '2026-09-15T08:00:00.000Z', '2026-09-21T02:00:00.000Z', 0, NULL, 0),
  (30007, 1003, 'owasp-asvs', 7,
   'Merge upstream V4.1.1 updates', 'closed', 'grace-researcher',
   'https://github.com/owasp-oasis/owasp-asvs/pull/7',
   2, 2, 2, 0, 0, 0, 'ccc7000000000000000000000000000000000000',
   '2026-08-28T12:00:00.000Z', '2026-08-10T09:00:00.000Z', '2026-08-28T12:00:00.000Z', '2026-09-21T02:00:00.000Z', 1, NULL, 0),
  (30008, 1003, 'owasp-asvs', 8,
   'Add V2 password storage requirements (duplicate)', 'closed', 'henry-hacker',
   'https://github.com/owasp-oasis/owasp-asvs/pull/8',
   1, 1, 0, 0, 0, 1, 'ccc8000000000000000000000000000000000000',
   NULL, '2026-09-01T10:00:00.000Z', '2026-09-10T14:00:00.000Z', '2026-09-21T02:00:00.000Z', 0, 30001, 1);

-- owasp-top-ten: 5 PRs (3 open, 1 merged, 1 closed)
INSERT OR IGNORE INTO pull_requests (
  id, repo_id, repo_name, number, title, state, author, html_url,
  oasis_comment_count, participants, consensus_accept, consensus_modify, consensus_reject,
  head_sha, merged_at, created_at, updated_at, synced_at, merged_upstream
) VALUES
  (40001, 1004, 'owasp-top-ten', 1,
   'Update A01 Broken Access Control examples', 'open', 'iris-dev',
   'https://github.com/owasp-oasis/owasp-top-ten/pull/1',
   2, 2, 1, 1, 0, 'ddd1000000000000000000000000000000000000',
   NULL, '2026-08-12T09:00:00.000Z', '2026-09-20T10:00:00.000Z', '2026-09-21T02:00:00.000Z', 0),
  (40002, 1004, 'owasp-top-ten', 2,
   'Add A03 injection prevention patterns', 'open', 'jack-reviewer',
   'https://github.com/owasp-oasis/owasp-top-ten/pull/2',
   3, 3, 3, 0, 0, 'ddd2000000000000000000000000000000000000',
   NULL, '2026-08-18T11:00:00.000Z', '2026-09-19T14:00:00.000Z', '2026-09-21T02:00:00.000Z', 0),
  (40003, 1004, 'owasp-top-ten', 3,
   'Document A04 insecure design mitigations', 'open', 'alice-dev',
   'https://github.com/owasp-oasis/owasp-top-ten/pull/3',
   1, 1, 0, 1, 0, 'ddd3000000000000000000000000000000000000',
   NULL, '2026-09-05T08:00:00.000Z', '2026-09-18T09:00:00.000Z', '2026-09-21T02:00:00.000Z', 0),
  (40004, 1004, 'owasp-top-ten', 4,
   'Translate A07 identification failures section', 'closed', 'bob-reviewer',
   'https://github.com/owasp-oasis/owasp-top-ten/pull/4',
   2, 2, 2, 0, 0, 'ddd4000000000000000000000000000000000000',
   '2026-08-15T12:00:00.000Z', '2026-07-20T09:00:00.000Z', '2026-08-15T12:00:00.000Z', '2026-09-21T02:00:00.000Z', 1),
  (40005, 1004, 'owasp-top-ten', 5,
   'Withdraw A09 security logging section (superseded)', 'closed', 'carol-security',
   'https://github.com/owasp-oasis/owasp-top-ten/pull/5',
   1, 1, 0, 0, 1, 'ddd5000000000000000000000000000000000000',
   NULL, '2026-06-15T09:00:00.000Z', '2026-07-01T12:00:00.000Z', '2026-09-21T02:00:00.000Z', 0);

-- owasp-mstg: 5 PRs (2 open, 1 merged, 2 soft-deleted)
INSERT OR IGNORE INTO pull_requests (
  id, repo_id, repo_name, number, title, state, author, html_url,
  oasis_comment_count, participants, consensus_accept,
  head_sha, merged_at, created_at, updated_at, synced_at, merged_upstream, deleted, deleted_at
) VALUES
  (50001, 1005, 'owasp-mstg', 1,
   'Add Android root detection test steps', 'open', 'dave-coder',
   'https://github.com/owasp-oasis/owasp-mstg/pull/1',
   2, 2, 1, 'eee1000000000000000000000000000000000000',
   NULL, '2026-08-20T09:00:00.000Z', '2026-09-20T14:00:00.000Z', '2026-09-21T02:00:00.000Z', 0, 0, NULL),
  (50002, 1005, 'owasp-mstg', 2,
   'iOS jailbreak detection testing patterns', 'open', 'eve-tester',
   'https://github.com/owasp-oasis/owasp-mstg/pull/2',
   1, 1, 1, 'eee2000000000000000000000000000000000000',
   NULL, '2026-09-01T10:00:00.000Z', '2026-09-19T11:00:00.000Z', '2026-09-21T02:00:00.000Z', 0, 0, NULL),
  (50003, 1005, 'owasp-mstg', 3,
   'Add certificate pinning bypass techniques', 'closed', 'frank-analyst',
   'https://github.com/owasp-oasis/owasp-mstg/pull/3',
   2, 2, 2, 'eee3000000000000000000000000000000000000',
   '2026-08-10T12:00:00.000Z', '2026-07-20T09:00:00.000Z', '2026-08-10T12:00:00.000Z', '2026-09-21T02:00:00.000Z', 1, 0, NULL),
  (50004, 1005, 'owasp-mstg', 4,
   'Add Flutter security test cases', 'closed', 'grace-researcher',
   'https://github.com/owasp-oasis/owasp-mstg/pull/4',
   0, 0, 0, 'eee4000000000000000000000000000000000000',
   NULL, '2026-06-01T09:00:00.000Z', '2026-09-15T08:00:00.000Z', '2026-09-21T02:00:00.000Z', 0, 1, '2026-09-15T08:00:00.000Z'),
  (50005, 1005, 'owasp-mstg', 5,
   'Kotlin coroutines security analysis (spam)', 'closed', 'spammer-bot',
   'https://github.com/owasp-oasis/owasp-mstg/pull/5',
   0, 0, 0, 'eee5000000000000000000000000000000000000',
   NULL, '2026-09-10T22:00:00.000Z', '2026-09-21T01:00:00.000Z', '2026-09-21T02:00:00.000Z', 0, 1, '2026-09-21T01:00:00.000Z');

-- ── PR comments ─────────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO pr_comments (id, pr_id, repo_name, pr_number, login, decision, created_at, pr_created_at) VALUES
  -- owasp-testing-guide PR 1 (4 comments, strong accept consensus)
  (110001, 10001, 'owasp-testing-guide', 1,  'bob-reviewer',    'accept',    '2026-08-11T10:00:00.000Z', '2026-08-10T09:00:00.000Z'),
  (110002, 10001, 'owasp-testing-guide', 1,  'carol-security',  'accept',    '2026-08-12T09:00:00.000Z', '2026-08-10T09:00:00.000Z'),
  (110003, 10001, 'owasp-testing-guide', 1,  'dave-coder',      'modify',    '2026-08-13T11:00:00.000Z', '2026-08-10T09:00:00.000Z'),
  (110004, 10001, 'owasp-testing-guide', 1,  'eve-tester',      'accept',    '2026-08-14T14:00:00.000Z', '2026-08-10T09:00:00.000Z'),
  -- owasp-testing-guide PR 2
  (110005, 10002, 'owasp-testing-guide', 2,  'alice-dev',       'accept',    '2026-08-13T09:00:00.000Z', '2026-08-12T10:00:00.000Z'),
  (110006, 10002, 'owasp-testing-guide', 2,  'carol-security',  'accept',    '2026-08-14T10:00:00.000Z', '2026-08-12T10:00:00.000Z'),
  (110007, 10002, 'owasp-testing-guide', 2,  'frank-analyst',   'modify',    '2026-08-15T11:00:00.000Z', '2026-08-12T10:00:00.000Z'),
  -- owasp-testing-guide PR 3 (modify consensus)
  (110008, 10003, 'owasp-testing-guide', 3,  'bob-reviewer',    'modify',    '2026-08-16T10:00:00.000Z', '2026-08-15T08:00:00.000Z'),
  (110009, 10003, 'owasp-testing-guide', 3,  'dave-coder',      'modify',    '2026-08-17T11:00:00.000Z', '2026-08-15T08:00:00.000Z'),
  -- owasp-testing-guide PR 4 (strong accept)
  (110010, 10004, 'owasp-testing-guide', 4,  'alice-dev',       'accept',    '2026-08-19T09:00:00.000Z', '2026-08-18T11:00:00.000Z'),
  (110011, 10004, 'owasp-testing-guide', 4,  'carol-security',  'accept',    '2026-08-20T10:00:00.000Z', '2026-08-18T11:00:00.000Z'),
  (110012, 10004, 'owasp-testing-guide', 4,  'eve-tester',      'accept',    '2026-08-21T11:00:00.000Z', '2026-08-18T11:00:00.000Z'),
  -- owasp-testing-guide PR 5
  (110013, 10005, 'owasp-testing-guide', 5,  'frank-analyst',   'accept',    '2026-08-21T10:00:00.000Z', '2026-08-20T14:00:00.000Z'),
  (110014, 10005, 'owasp-testing-guide', 5,  'grace-researcher','modify',    '2026-08-22T11:00:00.000Z', '2026-08-20T14:00:00.000Z'),
  -- owasp-testing-guide PR 6
  (110015, 10006, 'owasp-testing-guide', 6,  'henry-hacker',    'accept',    '2026-08-23T10:00:00.000Z', '2026-08-22T09:00:00.000Z'),
  (110016, 10006, 'owasp-testing-guide', 6,  'iris-dev',        'accept',    '2026-08-24T11:00:00.000Z', '2026-08-22T09:00:00.000Z'),
  -- owasp-testing-guide PR 7
  (110017, 10007, 'owasp-testing-guide', 7,  'jack-reviewer',   'accept',    '2026-08-26T10:00:00.000Z', '2026-08-25T12:00:00.000Z'),
  -- owasp-testing-guide PR 8
  (110018, 10008, 'owasp-testing-guide', 8,  'alice-dev',       'modify',    '2026-08-29T10:00:00.000Z', '2026-08-28T15:00:00.000Z'),
  -- owasp-testing-guide PR 10 (mixed)
  (110019, 10010, 'owasp-testing-guide', 10, 'bob-reviewer',    'accept',    '2026-09-06T10:00:00.000Z', '2026-09-05T08:00:00.000Z'),
  (110020, 10010, 'owasp-testing-guide', 10, 'carol-security',  'modify',    '2026-09-07T11:00:00.000Z', '2026-09-05T08:00:00.000Z'),
  (110021, 10010, 'owasp-testing-guide', 10, 'dave-coder',      'modify',    '2026-09-08T12:00:00.000Z', '2026-09-05T08:00:00.000Z'),
  -- owasp-wstg PR 1
  (120001, 20001, 'owasp-wstg', 1,  'alice-dev',       'accept',    '2026-08-06T10:00:00.000Z', '2026-08-05T09:00:00.000Z'),
  (120002, 20001, 'owasp-wstg', 1,  'frank-analyst',   'accept',    '2026-08-07T11:00:00.000Z', '2026-08-05T09:00:00.000Z'),
  (120003, 20001, 'owasp-wstg', 1,  'henry-hacker',    'modify',    '2026-08-08T12:00:00.000Z', '2026-08-05T09:00:00.000Z'),
  -- owasp-wstg PR 2
  (120004, 20002, 'owasp-wstg', 2,  'grace-researcher','accept',    '2026-08-11T10:00:00.000Z', '2026-08-10T11:00:00.000Z'),
  (120005, 20002, 'owasp-wstg', 2,  'jack-reviewer',   'modify',    '2026-08-12T11:00:00.000Z', '2026-08-10T11:00:00.000Z'),
  -- owasp-wstg PR 3
  (120006, 20003, 'owasp-wstg', 3,  'bob-reviewer',    'accept',    '2026-08-16T10:00:00.000Z', '2026-08-15T14:00:00.000Z'),
  (120007, 20003, 'owasp-wstg', 3,  'iris-dev',        'accept',    '2026-08-17T11:00:00.000Z', '2026-08-15T14:00:00.000Z'),
  -- owasp-wstg PR 4
  (120008, 20004, 'owasp-wstg', 4,  'carol-security',  'modify',    '2026-09-02T10:00:00.000Z', '2026-09-01T08:00:00.000Z'),
  -- owasp-asvs PR 1
  (130001, 30001, 'owasp-asvs', 1,  'bob-reviewer',    'accept',    '2026-08-02T10:00:00.000Z', '2026-08-01T09:00:00.000Z'),
  (130002, 30001, 'owasp-asvs', 1,  'carol-security',  'accept',    '2026-08-03T11:00:00.000Z', '2026-08-01T09:00:00.000Z'),
  (130003, 30001, 'owasp-asvs', 1,  'eve-tester',      'modify',    '2026-08-04T12:00:00.000Z', '2026-08-01T09:00:00.000Z'),
  -- owasp-asvs PR 2
  (130004, 30002, 'owasp-asvs', 2,  'dave-coder',      'accept',    '2026-08-06T10:00:00.000Z', '2026-08-05T10:00:00.000Z'),
  (130005, 30002, 'owasp-asvs', 2,  'frank-analyst',   'modify',    '2026-08-07T11:00:00.000Z', '2026-08-05T10:00:00.000Z'),
  -- owasp-asvs PR 3 (strong accept)
  (130006, 30003, 'owasp-asvs', 3,  'grace-researcher','accept',    '2026-08-11T10:00:00.000Z', '2026-08-10T14:00:00.000Z'),
  (130007, 30003, 'owasp-asvs', 3,  'henry-hacker',    'accept',    '2026-08-12T11:00:00.000Z', '2026-08-10T14:00:00.000Z'),
  (130008, 30003, 'owasp-asvs', 3,  'iris-dev',        'accept',    '2026-08-13T12:00:00.000Z', '2026-08-10T14:00:00.000Z'),
  -- owasp-asvs PR 4
  (130009, 30004, 'owasp-asvs', 4,  'jack-reviewer',   'accept',    '2026-08-16T10:00:00.000Z', '2026-08-15T08:00:00.000Z'),
  (130010, 30004, 'owasp-asvs', 4,  'alice-dev',       'accept',    '2026-08-17T11:00:00.000Z', '2026-08-15T08:00:00.000Z'),
  -- owasp-asvs PR 5
  (130011, 30005, 'owasp-asvs', 5,  'bob-reviewer',    'accept',    '2026-08-21T10:00:00.000Z', '2026-08-20T11:00:00.000Z'),
  -- owasp-asvs PR 6
  (130012, 30006, 'owasp-asvs', 6,  'carol-security',  'modify',    '2026-09-11T10:00:00.000Z', '2026-09-10T09:00:00.000Z'),
  -- owasp-asvs PR 8 (duplicate decision)
  (130013, 30008, 'owasp-asvs', 8,  'alice-dev',       'duplicate', '2026-09-02T10:00:00.000Z', '2026-09-01T10:00:00.000Z'),
  -- owasp-top-ten PR 1
  (140001, 40001, 'owasp-top-ten', 1, 'jack-reviewer',  'accept',   '2026-08-13T10:00:00.000Z', '2026-08-12T09:00:00.000Z'),
  (140002, 40001, 'owasp-top-ten', 1, 'carol-security', 'modify',   '2026-08-14T11:00:00.000Z', '2026-08-12T09:00:00.000Z'),
  -- owasp-top-ten PR 2 (strong accept)
  (140003, 40002, 'owasp-top-ten', 2, 'alice-dev',      'accept',   '2026-08-19T10:00:00.000Z', '2026-08-18T11:00:00.000Z'),
  (140004, 40002, 'owasp-top-ten', 2, 'dave-coder',     'accept',   '2026-08-20T11:00:00.000Z', '2026-08-18T11:00:00.000Z'),
  (140005, 40002, 'owasp-top-ten', 2, 'eve-tester',     'accept',   '2026-08-21T12:00:00.000Z', '2026-08-18T11:00:00.000Z'),
  -- owasp-top-ten PR 3
  (140006, 40003, 'owasp-top-ten', 3, 'grace-researcher','modify',  '2026-09-06T10:00:00.000Z', '2026-09-05T08:00:00.000Z'),
  -- owasp-mstg PR 1
  (150001, 50001, 'owasp-mstg', 1, 'alice-dev',      'accept',      '2026-08-21T10:00:00.000Z', '2026-08-20T09:00:00.000Z'),
  (150002, 50001, 'owasp-mstg', 1, 'frank-analyst',  'modify',      '2026-08-22T11:00:00.000Z', '2026-08-20T09:00:00.000Z'),
  -- owasp-mstg PR 2
  (150003, 50002, 'owasp-mstg', 2, 'henry-hacker',   'accept',      '2026-09-02T10:00:00.000Z', '2026-09-01T10:00:00.000Z');

-- ── Comment reactions (17) ─────────────────────────────────────────────────────
INSERT OR IGNORE INTO comment_reactions (comment_id, reactor, content, is_positive) VALUES
  (110001, 'carol-security',  '+1',     1),
  (110001, 'eve-tester',      '+1',     1),
  (110002, 'alice-dev',       'heart',  1),
  (110002, 'bob-reviewer',    '+1',     1),
  (110004, 'dave-coder',      '+1',     1),
  (110010, 'frank-analyst',   '+1',     1),
  (110011, 'grace-researcher','+1',     1),
  (110012, 'henry-hacker',    'rocket', 1),
  (120001, 'carol-security',  '+1',     1),
  (120006, 'alice-dev',       '+1',     1),
  (120007, 'dave-coder',      '+1',     1),
  (130001, 'dave-coder',      '+1',     1),
  (130006, 'alice-dev',       'heart',  1),
  (130007, 'bob-reviewer',    '+1',     1),
  (130008, 'carol-security',  '+1',     1),
  (140003, 'jack-reviewer',   '+1',     1),
  (140004, 'alice-dev',       'heart',  1);

-- ── PR participants ────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO pr_participants (pr_id, repo_name, pr_number, login, interactions, decision) VALUES
  (10001, 'owasp-testing-guide', 1,  'bob-reviewer',    1, 'accept'),
  (10001, 'owasp-testing-guide', 1,  'carol-security',  1, 'accept'),
  (10001, 'owasp-testing-guide', 1,  'dave-coder',      1, 'modify'),
  (10001, 'owasp-testing-guide', 1,  'eve-tester',      1, 'accept'),
  (10002, 'owasp-testing-guide', 2,  'alice-dev',       1, 'accept'),
  (10002, 'owasp-testing-guide', 2,  'carol-security',  1, 'accept'),
  (10002, 'owasp-testing-guide', 2,  'frank-analyst',   1, 'modify'),
  (10003, 'owasp-testing-guide', 3,  'bob-reviewer',    1, 'modify'),
  (10003, 'owasp-testing-guide', 3,  'dave-coder',      1, 'modify'),
  (10004, 'owasp-testing-guide', 4,  'alice-dev',       1, 'accept'),
  (10004, 'owasp-testing-guide', 4,  'carol-security',  1, 'accept'),
  (10004, 'owasp-testing-guide', 4,  'eve-tester',      1, 'accept'),
  (10005, 'owasp-testing-guide', 5,  'frank-analyst',   1, 'accept'),
  (10005, 'owasp-testing-guide', 5,  'grace-researcher',1, 'modify'),
  (10006, 'owasp-testing-guide', 6,  'henry-hacker',    1, 'accept'),
  (10006, 'owasp-testing-guide', 6,  'iris-dev',        1, 'accept'),
  (10007, 'owasp-testing-guide', 7,  'jack-reviewer',   1, 'accept'),
  (10008, 'owasp-testing-guide', 8,  'alice-dev',       1, 'modify'),
  (10010, 'owasp-testing-guide', 10, 'bob-reviewer',    1, 'accept'),
  (10010, 'owasp-testing-guide', 10, 'carol-security',  1, 'modify'),
  (10010, 'owasp-testing-guide', 10, 'dave-coder',      1, 'modify'),
  (20001, 'owasp-wstg', 1, 'alice-dev',        1, 'accept'),
  (20001, 'owasp-wstg', 1, 'frank-analyst',    1, 'accept'),
  (20001, 'owasp-wstg', 1, 'henry-hacker',     1, 'modify'),
  (20002, 'owasp-wstg', 2, 'grace-researcher', 1, 'accept'),
  (20002, 'owasp-wstg', 2, 'jack-reviewer',    1, 'modify'),
  (20003, 'owasp-wstg', 3, 'bob-reviewer',     1, 'accept'),
  (20003, 'owasp-wstg', 3, 'iris-dev',         1, 'accept'),
  (20004, 'owasp-wstg', 4, 'carol-security',   1, 'modify'),
  (30001, 'owasp-asvs', 1, 'bob-reviewer',     1, 'accept'),
  (30001, 'owasp-asvs', 1, 'carol-security',   1, 'accept'),
  (30001, 'owasp-asvs', 1, 'eve-tester',       1, 'modify'),
  (30002, 'owasp-asvs', 2, 'dave-coder',       1, 'accept'),
  (30002, 'owasp-asvs', 2, 'frank-analyst',    1, 'modify'),
  (30003, 'owasp-asvs', 3, 'grace-researcher', 1, 'accept'),
  (30003, 'owasp-asvs', 3, 'henry-hacker',     1, 'accept'),
  (30003, 'owasp-asvs', 3, 'iris-dev',         1, 'accept'),
  (30004, 'owasp-asvs', 4, 'jack-reviewer',    1, 'accept'),
  (30004, 'owasp-asvs', 4, 'alice-dev',        1, 'accept'),
  (30005, 'owasp-asvs', 5, 'bob-reviewer',     1, 'accept'),
  (30006, 'owasp-asvs', 6, 'carol-security',   1, 'modify'),
  (30008, 'owasp-asvs', 8, 'alice-dev',        1, 'duplicate'),
  (40001, 'owasp-top-ten', 1, 'jack-reviewer',   1, 'accept'),
  (40001, 'owasp-top-ten', 1, 'carol-security',  1, 'modify'),
  (40002, 'owasp-top-ten', 2, 'alice-dev',       1, 'accept'),
  (40002, 'owasp-top-ten', 2, 'dave-coder',      1, 'accept'),
  (40002, 'owasp-top-ten', 2, 'eve-tester',      1, 'accept'),
  (40003, 'owasp-top-ten', 3, 'grace-researcher',1, 'modify'),
  (50001, 'owasp-mstg', 1, 'alice-dev',       1, 'accept'),
  (50001, 'owasp-mstg', 1, 'frank-analyst',   1, 'modify'),
  (50002, 'owasp-mstg', 2, 'henry-hacker',    1, 'accept');

-- ── Contributors (10) ─────────────────────────────────────────────────────────
INSERT OR IGNORE INTO contributors (
  login, avatar_url,
  prs_worked, total_interactions, accepts, modifies, rejects, duplicates,
  reactions_received, reactions_given,
  comment_score, peer_score, reaction_score, trust_score, base_reputation, modified_reputation,
  rank_90d, rank_90d_oldest_activity, synced_at
) VALUES
  ('alice-dev',        'https://avatars.githubusercontent.com/u/10001',
   8, 12, 8, 2, 0, 1, 7, 3,
   12.0, 3.5, 0.75, 20.0, 36.25, 42.5,
   1, '2026-07-10T08:00:00.000Z', '2026-09-21T02:00:00.000Z'),
  ('bob-reviewer',     'https://avatars.githubusercontent.com/u/10002',
   7, 9, 6, 1, 0, 0, 4, 5,
   9.0, 2.0, 1.25, 10.0, 22.25, 25.0,
   2, '2026-07-15T14:00:00.000Z', '2026-09-21T02:00:00.000Z'),
  ('carol-security',   'https://avatars.githubusercontent.com/u/10003',
   7, 10, 6, 3, 0, 0, 5, 2,
   10.0, 2.5, 0.5, 10.0, 23.0, 27.0,
   3, '2026-07-20T10:00:00.000Z', '2026-09-21T02:00:00.000Z'),
  ('dave-coder',       'https://avatars.githubusercontent.com/u/10004',
   6, 9, 5, 3, 0, 0, 2, 4,
   9.0, 1.0, 1.0, 10.0, 21.0, 24.0,
   4, '2026-07-15T14:00:00.000Z', '2026-09-21T02:00:00.000Z'),
  ('eve-tester',       'https://avatars.githubusercontent.com/u/10005',
   5, 7, 5, 1, 0, 0, 2, 1,
   7.0, 1.0, 0.25, 10.0, 18.25, 20.5,
   5, '2026-07-20T10:00:00.000Z', '2026-09-21T02:00:00.000Z'),
  ('frank-analyst',    'https://avatars.githubusercontent.com/u/10006',
   5, 7, 4, 2, 0, 0, 1, 2,
   7.0, 0.5, 0.5, 0.0, 8.0, 9.0,
   6, '2026-08-01T09:00:00.000Z', '2026-09-21T02:00:00.000Z'),
  ('grace-researcher', 'https://avatars.githubusercontent.com/u/10007',
   4, 6, 3, 2, 0, 0, 1, 2,
   6.0, 0.5, 0.5, 0.0, 7.0, 8.0,
   7, '2026-08-05T11:00:00.000Z', '2026-09-21T02:00:00.000Z'),
  ('henry-hacker',     'https://avatars.githubusercontent.com/u/10008',
   4, 5, 3, 1, 0, 0, 2, 1,
   5.0, 1.0, 0.25, 0.0, 6.25, 7.0,
   8, '2026-08-10T08:00:00.000Z', '2026-09-21T02:00:00.000Z'),
  ('iris-dev',         'https://avatars.githubusercontent.com/u/10009',
   3, 4, 3, 0, 0, 0, 1, 1,
   4.0, 0.5, 0.25, 0.0, 4.75, 5.5,
   9, '2026-08-15T15:00:00.000Z', '2026-09-21T02:00:00.000Z'),
  ('jack-reviewer',    'https://avatars.githubusercontent.com/u/10010',
   3, 4, 2, 1, 0, 0, 1, 2,
   4.0, 0.5, 0.5, 0.0, 5.0, 5.5,
   10, '2026-08-20T10:00:00.000Z', '2026-09-21T02:00:00.000Z');

-- ── User votes (mirrors pr_comments decisions) ────────────────────────────────
INSERT OR IGNORE INTO user_votes (github_login, pr_id, repo_name, pr_number, decision, comment_id, voted_at) VALUES
  ('bob-reviewer',    10001,'owasp-testing-guide',1,  'accept',   110001,'2026-08-11T10:00:00.000Z'),
  ('carol-security',  10001,'owasp-testing-guide',1,  'accept',   110002,'2026-08-12T09:00:00.000Z'),
  ('dave-coder',      10001,'owasp-testing-guide',1,  'modify',   110003,'2026-08-13T11:00:00.000Z'),
  ('eve-tester',      10001,'owasp-testing-guide',1,  'accept',   110004,'2026-08-14T14:00:00.000Z'),
  ('alice-dev',       10002,'owasp-testing-guide',2,  'accept',   110005,'2026-08-13T09:00:00.000Z'),
  ('carol-security',  10002,'owasp-testing-guide',2,  'accept',   110006,'2026-08-14T10:00:00.000Z'),
  ('frank-analyst',   10002,'owasp-testing-guide',2,  'modify',   110007,'2026-08-15T11:00:00.000Z'),
  ('bob-reviewer',    10003,'owasp-testing-guide',3,  'modify',   110008,'2026-08-16T10:00:00.000Z'),
  ('dave-coder',      10003,'owasp-testing-guide',3,  'modify',   110009,'2026-08-17T11:00:00.000Z'),
  ('alice-dev',       10004,'owasp-testing-guide',4,  'accept',   110010,'2026-08-19T09:00:00.000Z'),
  ('carol-security',  10004,'owasp-testing-guide',4,  'accept',   110011,'2026-08-20T10:00:00.000Z'),
  ('eve-tester',      10004,'owasp-testing-guide',4,  'accept',   110012,'2026-08-21T11:00:00.000Z'),
  ('frank-analyst',   10005,'owasp-testing-guide',5,  'accept',   110013,'2026-08-21T10:00:00.000Z'),
  ('grace-researcher',10005,'owasp-testing-guide',5,  'modify',   110014,'2026-08-22T11:00:00.000Z'),
  ('henry-hacker',    10006,'owasp-testing-guide',6,  'accept',   110015,'2026-08-23T10:00:00.000Z'),
  ('iris-dev',        10006,'owasp-testing-guide',6,  'accept',   110016,'2026-08-24T11:00:00.000Z'),
  ('jack-reviewer',   10007,'owasp-testing-guide',7,  'accept',   110017,'2026-08-26T10:00:00.000Z'),
  ('alice-dev',       10008,'owasp-testing-guide',8,  'modify',   110018,'2026-08-29T10:00:00.000Z'),
  ('bob-reviewer',    10010,'owasp-testing-guide',10, 'accept',   110019,'2026-09-06T10:00:00.000Z'),
  ('carol-security',  10010,'owasp-testing-guide',10, 'modify',   110020,'2026-09-07T11:00:00.000Z'),
  ('dave-coder',      10010,'owasp-testing-guide',10, 'modify',   110021,'2026-09-08T12:00:00.000Z'),
  ('alice-dev',       20001,'owasp-wstg',1, 'accept',  120001,'2026-08-06T10:00:00.000Z'),
  ('frank-analyst',   20001,'owasp-wstg',1, 'accept',  120002,'2026-08-07T11:00:00.000Z'),
  ('henry-hacker',    20001,'owasp-wstg',1, 'modify',  120003,'2026-08-08T12:00:00.000Z'),
  ('grace-researcher',20002,'owasp-wstg',2, 'accept',  120004,'2026-08-11T10:00:00.000Z'),
  ('jack-reviewer',   20002,'owasp-wstg',2, 'modify',  120005,'2026-08-12T11:00:00.000Z'),
  ('bob-reviewer',    20003,'owasp-wstg',3, 'accept',  120006,'2026-08-16T10:00:00.000Z'),
  ('iris-dev',        20003,'owasp-wstg',3, 'accept',  120007,'2026-08-17T11:00:00.000Z'),
  ('carol-security',  20004,'owasp-wstg',4, 'modify',  120008,'2026-09-02T10:00:00.000Z'),
  ('bob-reviewer',    30001,'owasp-asvs',1, 'accept',  130001,'2026-08-02T10:00:00.000Z'),
  ('carol-security',  30001,'owasp-asvs',1, 'accept',  130002,'2026-08-03T11:00:00.000Z'),
  ('eve-tester',      30001,'owasp-asvs',1, 'modify',  130003,'2026-08-04T12:00:00.000Z'),
  ('dave-coder',      30002,'owasp-asvs',2, 'accept',  130004,'2026-08-06T10:00:00.000Z'),
  ('frank-analyst',   30002,'owasp-asvs',2, 'modify',  130005,'2026-08-07T11:00:00.000Z'),
  ('grace-researcher',30003,'owasp-asvs',3, 'accept',  130006,'2026-08-11T10:00:00.000Z'),
  ('henry-hacker',    30003,'owasp-asvs',3, 'accept',  130007,'2026-08-12T11:00:00.000Z'),
  ('iris-dev',        30003,'owasp-asvs',3, 'accept',  130008,'2026-08-13T12:00:00.000Z'),
  ('jack-reviewer',   30004,'owasp-asvs',4, 'accept',  130009,'2026-08-16T10:00:00.000Z'),
  ('alice-dev',       30004,'owasp-asvs',4, 'accept',  130010,'2026-08-17T11:00:00.000Z'),
  ('bob-reviewer',    30005,'owasp-asvs',5, 'accept',  130011,'2026-08-21T10:00:00.000Z'),
  ('carol-security',  30006,'owasp-asvs',6, 'modify',  130012,'2026-09-11T10:00:00.000Z'),
  ('alice-dev',       30008,'owasp-asvs',8, 'duplicate',130013,'2026-09-02T10:00:00.000Z'),
  ('jack-reviewer',   40001,'owasp-top-ten',1,'accept', 140001,'2026-08-13T10:00:00.000Z'),
  ('carol-security',  40001,'owasp-top-ten',1,'modify', 140002,'2026-08-14T11:00:00.000Z'),
  ('alice-dev',       40002,'owasp-top-ten',2,'accept', 140003,'2026-08-19T10:00:00.000Z'),
  ('dave-coder',      40002,'owasp-top-ten',2,'accept', 140004,'2026-08-20T11:00:00.000Z'),
  ('eve-tester',      40002,'owasp-top-ten',2,'accept', 140005,'2026-08-21T12:00:00.000Z'),
  ('grace-researcher',40003,'owasp-top-ten',3,'modify', 140006,'2026-09-06T10:00:00.000Z'),
  ('alice-dev',       50001,'owasp-mstg',1, 'accept',  150001,'2026-08-21T10:00:00.000Z'),
  ('frank-analyst',   50001,'owasp-mstg',1, 'modify',  150002,'2026-08-22T11:00:00.000Z'),
  ('henry-hacker',    50002,'owasp-mstg',2, 'accept',  150003,'2026-09-02T10:00:00.000Z');

-- ── Validation requests (open PRs) ─────────────────────────────────────────────
INSERT OR IGNORE INTO validation_requests (pr_id, requested_at, request_source, status, badge_eligible, created_at, updated_at) VALUES
  (10001,'2026-08-10T09:00:00.000Z','workspace_sync','responded',1,'2026-08-10T09:00:00.000Z','2026-08-14T14:00:00.000Z'),
  (10002,'2026-08-12T10:00:00.000Z','workspace_sync','responded',1,'2026-08-12T10:00:00.000Z','2026-08-15T11:00:00.000Z'),
  (10003,'2026-08-15T08:00:00.000Z','workspace_sync','open',     1,'2026-08-15T08:00:00.000Z','2026-09-21T02:00:00.000Z'),
  (10004,'2026-08-18T11:00:00.000Z','workspace_sync','responded',1,'2026-08-18T11:00:00.000Z','2026-08-21T11:00:00.000Z'),
  (10005,'2026-08-20T14:00:00.000Z','workspace_sync','responded',1,'2026-08-20T14:00:00.000Z','2026-08-22T11:00:00.000Z'),
  (10006,'2026-08-22T09:00:00.000Z','workspace_sync','responded',1,'2026-08-22T09:00:00.000Z','2026-08-24T11:00:00.000Z'),
  (10007,'2026-08-25T12:00:00.000Z','workspace_sync','responded',1,'2026-08-25T12:00:00.000Z','2026-08-26T10:00:00.000Z'),
  (10008,'2026-08-28T15:00:00.000Z','workspace_sync','open',     1,'2026-08-28T15:00:00.000Z','2026-09-21T02:00:00.000Z'),
  (10009,'2026-09-18T10:00:00.000Z','workspace_sync','open',     1,'2026-09-18T10:00:00.000Z','2026-09-21T02:00:00.000Z'),
  (10010,'2026-09-05T08:00:00.000Z','workspace_sync','open',     1,'2026-09-05T08:00:00.000Z','2026-09-21T02:00:00.000Z'),
  (10011,'2026-09-20T09:00:00.000Z','workspace_sync','open',     1,'2026-09-20T09:00:00.000Z','2026-09-21T02:00:00.000Z'),
  (20001,'2026-08-05T09:00:00.000Z','workspace_sync','responded',1,'2026-08-05T09:00:00.000Z','2026-08-08T12:00:00.000Z'),
  (20002,'2026-08-10T11:00:00.000Z','workspace_sync','responded',1,'2026-08-10T11:00:00.000Z','2026-08-12T11:00:00.000Z'),
  (20003,'2026-08-15T14:00:00.000Z','workspace_sync','responded',1,'2026-08-15T14:00:00.000Z','2026-08-17T11:00:00.000Z'),
  (20004,'2026-09-01T08:00:00.000Z','workspace_sync','open',     1,'2026-09-01T08:00:00.000Z','2026-09-21T02:00:00.000Z'),
  (20005,'2026-09-19T10:00:00.000Z','workspace_sync','open',     1,'2026-09-19T10:00:00.000Z','2026-09-21T02:00:00.000Z'),
  (30001,'2026-08-01T09:00:00.000Z','workspace_sync','responded',1,'2026-08-01T09:00:00.000Z','2026-08-04T12:00:00.000Z'),
  (30002,'2026-08-05T10:00:00.000Z','workspace_sync','responded',1,'2026-08-05T10:00:00.000Z','2026-08-07T11:00:00.000Z'),
  (30003,'2026-08-10T14:00:00.000Z','workspace_sync','responded',1,'2026-08-10T14:00:00.000Z','2026-08-13T12:00:00.000Z'),
  (30004,'2026-08-15T08:00:00.000Z','workspace_sync','responded',1,'2026-08-15T08:00:00.000Z','2026-08-17T11:00:00.000Z'),
  (30005,'2026-08-20T11:00:00.000Z','workspace_sync','responded',1,'2026-08-20T11:00:00.000Z','2026-08-21T10:00:00.000Z'),
  (30006,'2026-09-10T09:00:00.000Z','workspace_sync','open',     1,'2026-09-10T09:00:00.000Z','2026-09-21T02:00:00.000Z'),
  (40001,'2026-08-12T09:00:00.000Z','workspace_sync','responded',1,'2026-08-12T09:00:00.000Z','2026-08-14T11:00:00.000Z'),
  (40002,'2026-08-18T11:00:00.000Z','workspace_sync','responded',1,'2026-08-18T11:00:00.000Z','2026-08-21T12:00:00.000Z'),
  (40003,'2026-09-05T08:00:00.000Z','workspace_sync','open',     1,'2026-09-05T08:00:00.000Z','2026-09-21T02:00:00.000Z'),
  (50001,'2026-08-20T09:00:00.000Z','workspace_sync','responded',1,'2026-08-20T09:00:00.000Z','2026-08-22T11:00:00.000Z'),
  (50002,'2026-09-01T10:00:00.000Z','workspace_sync','open',     1,'2026-09-01T10:00:00.000Z','2026-09-21T02:00:00.000Z');

-- ── Sync job history ────────────────────────────────────────────────────────────
-- Three full canonical pipeline runs (past 3 days, all succeeded),
-- one failed run today, and one HubSpot run.

-- Pipeline 1 — 2026-09-19
INSERT OR IGNORE INTO sync_job_runs (
  id, pipeline_run_id, job_key, label, category, trigger_type, mode, status,
  started_at, finished_at, duration_ms, expected_items, completed_items, metrics_json, created_at
) VALUES
  ('run-p1-parent',   'pipeline-20260919','canonical_workspace_sync','Canonical Workspace sync','workspace','scheduled',   'live','succeeded','2026-09-19T02:00:00.000Z','2026-09-19T02:18:00.000Z',1080000,0, 0, '{"repositories":5,"pull_requests":36,"comments":51}','2026-09-19T02:00:00.000Z'),
  ('run-p1-repos',    'pipeline-20260919','repository_inventory',    'Repository inventory',    'workspace','continuation','live','succeeded','2026-09-19T02:01:00.000Z','2026-09-19T02:03:00.000Z', 120000,5, 5, '{"repositories":5}',                                  '2026-09-19T02:01:00.000Z'),
  ('run-p1-prs',      'pipeline-20260919','pull_request_catalog',    'Pull request catalog',    'workspace','continuation','live','succeeded','2026-09-19T02:03:00.000Z','2026-09-19T02:07:00.000Z', 240000,36,36,'{"pull_requests":36,"open":24}',                       '2026-09-19T02:03:00.000Z'),
  ('run-p1-merge',    'pipeline-20260919','upstream_merge_status',   'Upstream merge status',   'workspace','continuation','live','succeeded','2026-09-19T02:07:00.000Z','2026-09-19T02:09:00.000Z', 120000,5, 5, '{"checked":5,"merged":4}',                            '2026-09-19T02:07:00.000Z'),
  ('run-p1-comments', 'pipeline-20260919','pull_request_comments',   'Pull request comments',   'workspace','continuation','live','succeeded','2026-09-19T02:09:00.000Z','2026-09-19T02:13:00.000Z', 240000,24,24,'{"comments":51}',                                     '2026-09-19T02:09:00.000Z'),
  ('run-p1-reactions','pipeline-20260919','comment_reactions',       'Comment reactions',       'workspace','continuation','live','succeeded','2026-09-19T02:13:00.000Z','2026-09-19T02:15:00.000Z', 120000,51,51,'{"reactions":17}',                                    '2026-09-19T02:13:00.000Z'),
  ('run-p1-votes',    'pipeline-20260919','vote_projection',         'Vote projection',         'workspace','continuation','live','succeeded','2026-09-19T02:15:00.000Z','2026-09-19T02:16:00.000Z',  60000,51,51,'{"votes":51}',                                       '2026-09-19T02:15:00.000Z'),
  ('run-p1-dups',     'pipeline-20260919','duplicate_resolution',    'Duplicate resolution',    'workspace','continuation','live','succeeded','2026-09-19T02:16:00.000Z','2026-09-19T02:17:00.000Z',  60000,1, 1, '{"resolved":1}',                                      '2026-09-19T02:16:00.000Z'),
  ('run-p1-scores',   'pipeline-20260919','contributor_scores',      'Contributor scores',      'workspace','continuation','live','succeeded','2026-09-19T02:17:00.000Z','2026-09-19T02:17:30.000Z',  30000,10,10,'{"contributors":10}',                                 '2026-09-19T02:17:00.000Z'),
  ('run-p1-orphan',   'pipeline-20260919','orphan_cleanup',          'Orphan cleanup',          'workspace','continuation','live','succeeded','2026-09-19T02:17:30.000Z','2026-09-19T02:18:00.000Z',  30000,36,36,'{"checked":36,"flagged":2}',                          '2026-09-19T02:17:30.000Z');

-- Pipeline 2 — 2026-09-20
INSERT OR IGNORE INTO sync_job_runs (
  id, pipeline_run_id, job_key, label, category, trigger_type, mode, status,
  started_at, finished_at, duration_ms, expected_items, completed_items, metrics_json, created_at
) VALUES
  ('run-p2-parent',   'pipeline-20260920','canonical_workspace_sync','Canonical Workspace sync','workspace','scheduled',   'live','succeeded','2026-09-20T02:00:00.000Z','2026-09-20T02:16:00.000Z',960000, 0, 0, '{"repositories":5,"pull_requests":36,"comments":51}','2026-09-20T02:00:00.000Z'),
  ('run-p2-repos',    'pipeline-20260920','repository_inventory',    'Repository inventory',    'workspace','continuation','live','succeeded','2026-09-20T02:01:00.000Z','2026-09-20T02:03:00.000Z',120000, 5, 5, '{"repositories":5}',                                  '2026-09-20T02:01:00.000Z'),
  ('run-p2-prs',      'pipeline-20260920','pull_request_catalog',    'Pull request catalog',    'workspace','continuation','live','succeeded','2026-09-20T02:03:00.000Z','2026-09-20T02:07:00.000Z',240000, 36,36,'{"pull_requests":36,"open":24}',                       '2026-09-20T02:03:00.000Z'),
  ('run-p2-merge',    'pipeline-20260920','upstream_merge_status',   'Upstream merge status',   'workspace','continuation','live','succeeded','2026-09-20T02:07:00.000Z','2026-09-20T02:09:00.000Z',120000, 5, 5, '{"checked":5,"merged":4}',                            '2026-09-20T02:07:00.000Z'),
  ('run-p2-comments', 'pipeline-20260920','pull_request_comments',   'Pull request comments',   'workspace','continuation','live','succeeded','2026-09-20T02:09:00.000Z','2026-09-20T02:12:00.000Z',180000, 24,24,'{"comments":51}',                                     '2026-09-20T02:09:00.000Z'),
  ('run-p2-reactions','pipeline-20260920','comment_reactions',       'Comment reactions',       'workspace','continuation','live','succeeded','2026-09-20T02:12:00.000Z','2026-09-20T02:13:30.000Z', 90000, 51,51,'{"reactions":17}',                                    '2026-09-20T02:12:00.000Z'),
  ('run-p2-votes',    'pipeline-20260920','vote_projection',         'Vote projection',         'workspace','continuation','live','succeeded','2026-09-20T02:13:30.000Z','2026-09-20T02:14:00.000Z', 30000, 51,51,'{"votes":51}',                                       '2026-09-20T02:13:30.000Z'),
  ('run-p2-dups',     'pipeline-20260920','duplicate_resolution',    'Duplicate resolution',    'workspace','continuation','live','succeeded','2026-09-20T02:14:00.000Z','2026-09-20T02:14:30.000Z', 30000, 1, 1, '{"resolved":1}',                                      '2026-09-20T02:14:00.000Z'),
  ('run-p2-scores',   'pipeline-20260920','contributor_scores',      'Contributor scores',      'workspace','continuation','live','succeeded','2026-09-20T02:14:30.000Z','2026-09-20T02:15:00.000Z', 30000, 10,10,'{"contributors":10}',                                 '2026-09-20T02:14:30.000Z'),
  ('run-p2-orphan',   'pipeline-20260920','orphan_cleanup',          'Orphan cleanup',          'workspace','continuation','live','succeeded','2026-09-20T02:15:00.000Z','2026-09-20T02:16:00.000Z', 60000, 36,36,'{"checked":36,"flagged":2}',                          '2026-09-20T02:15:00.000Z');

-- Pipeline 3 — 2026-09-21 early morning (most recent succeeded)
INSERT OR IGNORE INTO sync_job_runs (
  id, pipeline_run_id, job_key, label, category, trigger_type, mode, status,
  started_at, finished_at, duration_ms, expected_items, completed_items, metrics_json, created_at
) VALUES
  ('run-p3-parent',   'pipeline-20260921-00','canonical_workspace_sync','Canonical Workspace sync','workspace','scheduled',   'live','succeeded','2026-09-21T02:00:00.000Z','2026-09-21T02:15:00.000Z',900000, 0, 0, '{"repositories":5,"pull_requests":36,"comments":51}','2026-09-21T02:00:00.000Z'),
  ('run-p3-repos',    'pipeline-20260921-00','repository_inventory',    'Repository inventory',    'workspace','continuation','live','succeeded','2026-09-21T02:01:00.000Z','2026-09-21T02:02:30.000Z', 90000, 5, 5, '{"repositories":5}',                                  '2026-09-21T02:01:00.000Z'),
  ('run-p3-prs',      'pipeline-20260921-00','pull_request_catalog',    'Pull request catalog',    'workspace','continuation','live','succeeded','2026-09-21T02:02:30.000Z','2026-09-21T02:06:00.000Z',210000, 36,36,'{"pull_requests":36,"open":24}',                       '2026-09-21T02:02:30.000Z'),
  ('run-p3-merge',    'pipeline-20260921-00','upstream_merge_status',   'Upstream merge status',   'workspace','continuation','live','succeeded','2026-09-21T02:06:00.000Z','2026-09-21T02:08:00.000Z',120000, 5, 5, '{"checked":5,"merged":4}',                            '2026-09-21T02:06:00.000Z'),
  ('run-p3-comments', 'pipeline-20260921-00','pull_request_comments',   'Pull request comments',   'workspace','continuation','live','succeeded','2026-09-21T02:08:00.000Z','2026-09-21T02:11:00.000Z',180000, 24,24,'{"comments":51}',                                     '2026-09-21T02:08:00.000Z'),
  ('run-p3-reactions','pipeline-20260921-00','comment_reactions',       'Comment reactions',       'workspace','continuation','live','succeeded','2026-09-21T02:11:00.000Z','2026-09-21T02:12:30.000Z', 90000, 51,51,'{"reactions":17}',                                    '2026-09-21T02:11:00.000Z'),
  ('run-p3-votes',    'pipeline-20260921-00','vote_projection',         'Vote projection',         'workspace','continuation','live','succeeded','2026-09-21T02:12:30.000Z','2026-09-21T02:13:00.000Z', 30000, 51,51,'{"votes":51}',                                       '2026-09-21T02:12:30.000Z'),
  ('run-p3-dups',     'pipeline-20260921-00','duplicate_resolution',    'Duplicate resolution',    'workspace','continuation','live','succeeded','2026-09-21T02:13:00.000Z','2026-09-21T02:13:30.000Z', 30000, 1, 1, '{"resolved":1}',                                      '2026-09-21T02:13:00.000Z'),
  ('run-p3-scores',   'pipeline-20260921-00','contributor_scores',      'Contributor scores',      'workspace','continuation','live','succeeded','2026-09-21T02:13:30.000Z','2026-09-21T02:14:00.000Z', 30000, 10,10,'{"contributors":10}',                                 '2026-09-21T02:13:30.000Z'),
  ('run-p3-orphan',   'pipeline-20260921-00','orphan_cleanup',          'Orphan cleanup',          'workspace','continuation','live','succeeded','2026-09-21T02:14:00.000Z','2026-09-21T02:15:00.000Z', 60000, 36,36,'{"checked":36,"flagged":2}',                          '2026-09-21T02:14:00.000Z');

-- Pipeline 4 — 2026-09-21 08:00 (failed at PR catalog stage)
INSERT OR IGNORE INTO sync_job_runs (
  id, pipeline_run_id, job_key, label, category, trigger_type, mode, status,
  started_at, finished_at, duration_ms, expected_items, completed_items, failed_items,
  error_code, error_summary, metrics_json, created_at
) VALUES
  ('run-p4-parent','pipeline-20260921-08','canonical_workspace_sync','Canonical Workspace sync','workspace','scheduled',   'live','failed',
   '2026-09-21T08:00:00.000Z','2026-09-21T08:04:00.000Z',240000,0, 0,0,
   'child_job_failed','pull_request_catalog failed: github_request_failed','{}','2026-09-21T08:00:00.000Z'),
  ('run-p4-repos', 'pipeline-20260921-08','repository_inventory',   'Repository inventory',    'workspace','continuation','live','succeeded',
   '2026-09-21T08:01:00.000Z','2026-09-21T08:02:30.000Z',90000, 5, 5,0,
   NULL,NULL,'{"repositories":5}','2026-09-21T08:01:00.000Z'),
  ('run-p4-prs',   'pipeline-20260921-08','pull_request_catalog',   'Pull request catalog',    'workspace','continuation','live','failed',
   '2026-09-21T08:02:30.000Z','2026-09-21T08:04:00.000Z',90000,36,12,1,
   'github_request_failed','GitHub API returned 503 after 3 retries','{"pull_requests_processed":12}','2026-09-21T08:02:30.000Z');

-- HubSpot run — 2026-09-20 (integration, succeeded)
INSERT OR IGNORE INTO sync_job_runs (
  id, pipeline_run_id, job_key, label, category, trigger_type, mode, status,
  started_at, finished_at, duration_ms, expected_items, completed_items, metrics_json, created_at
) VALUES
  ('run-hubspot-20',NULL,'hubspot_contacts','HubSpot contacts','integration','scheduled','live','succeeded',
   '2026-09-20T04:00:00.000Z','2026-09-20T04:02:00.000Z',120000,3,3,'{"synced":2,"skipped":1}','2026-09-20T04:00:00.000Z');

-- ── Sync daily budgets (past 3 days) ──────────────────────────────────────────
INSERT OR IGNORE INTO sync_daily_budgets (budget_date, budget_key, label, unit, configured_limit, consumed, remaining, updated_at) VALUES
  ('2026-09-19','workflow_steps',                   'OASIS Workflow steps',              'steps',               2000,142,1858,'2026-09-19T02:18:00.000Z'),
  ('2026-09-19','workflow_external_request_limit',  'Peak Workflow instance requests',   'requests per instance',50, 28, 22, '2026-09-19T02:18:00.000Z'),
  ('2026-09-19','github_api_requests',              'GitHub API requests',               'requests',            5000,312,4688,'2026-09-19T02:18:00.000Z'),
  ('2026-09-20','workflow_steps',                   'OASIS Workflow steps',              'steps',               2000,138,1862,'2026-09-20T02:16:00.000Z'),
  ('2026-09-20','workflow_external_request_limit',  'Peak Workflow instance requests',   'requests per instance',50, 24, 26, '2026-09-20T02:16:00.000Z'),
  ('2026-09-20','github_api_requests',              'GitHub API requests',               'requests',            5000,298,4702,'2026-09-20T02:16:00.000Z'),
  ('2026-09-21','workflow_steps',                   'OASIS Workflow steps',              'steps',               2000, 87,1913,'2026-09-21T02:15:00.000Z'),
  ('2026-09-21','workflow_external_request_limit',  'Peak Workflow instance requests',   'requests per instance',50, 19, 31, '2026-09-21T02:15:00.000Z'),
  ('2026-09-21','github_api_requests',              'GitHub API requests',               'requests',            5000,187,4813,'2026-09-21T02:15:00.000Z');

-- ── Analytics — 7 days of Cloudflare metrics ──────────────────────────────────
INSERT OR IGNORE INTO analytics_daily_cloudflare (
  metric_date, requests_estimate, visits_estimate, response_bytes,
  response_2xx, response_3xx, response_4xx, response_5xx,
  cache_hits_estimate, cache_misses_estimate, sample_interval, source_is_estimated, collected_at
) VALUES
  ('2026-09-15',4820,312,52400000,4210,380,195,35,3180,1640,0.1,1,'2026-09-16T01:00:00.000Z'),
  ('2026-09-16',5140,341,56100000,4490,405,208,37,3380,1760,0.1,1,'2026-09-17T01:00:00.000Z'),
  ('2026-09-17',4960,328,54200000,4340,392,199,29,3270,1690,0.1,1,'2026-09-18T01:00:00.000Z'),
  ('2026-09-18',5310,358,57800000,4660,418,212,20,3510,1800,0.1,1,'2026-09-19T01:00:00.000Z'),
  ('2026-09-19',5680,389,61900000,4980,445,228,27,3760,1920,0.1,1,'2026-09-20T01:00:00.000Z'),
  ('2026-09-20',5920,401,64500000,5190,463,241,26,3930,1990,0.1,1,'2026-09-21T01:00:00.000Z'),
  ('2026-09-21',3240,218,35200000,2840,256,132,12,2140,1100,0.1,1,'2026-09-21T12:00:00.000Z');

-- ── Analytics — 7 days of route metrics ───────────────────────────────────────
INSERT OR IGNORE INTO analytics_daily_routes (
  metric_date, route_key, page_views, navigation_count, load_ms_sum, load_ms_max,
  response_2xx, response_3xx, response_4xx, response_5xx, updated_at
) VALUES
  ('2026-09-15','/',              1840,412,2450000,3200,1820,18,2,0,'2026-09-16T01:00:00.000Z'),
  ('2026-09-15','/leaderboard',   980,280,1960000,4100, 974, 6,0,0,'2026-09-16T01:00:00.000Z'),
  ('2026-09-15','/workspace',     620,201,1240000,2800, 617, 3,0,0,'2026-09-16T01:00:00.000Z'),
  ('2026-09-15','/api/sync/status',0,  0, 0,      0,    892, 0,8,0,'2026-09-16T01:00:00.000Z'),
  ('2026-09-16','/',             1960,438,2610000,3100,1941,19,0,0,'2026-09-17T01:00:00.000Z'),
  ('2026-09-16','/leaderboard', 1040,302,2080000,3900,1036, 4,0,0,'2026-09-17T01:00:00.000Z'),
  ('2026-09-16','/workspace',    680,218,1360000,2600, 678, 2,0,0,'2026-09-17T01:00:00.000Z'),
  ('2026-09-16','/api/sync/status',0,  0, 0,      0,    954, 0,5,0,'2026-09-17T01:00:00.000Z'),
  ('2026-09-17','/',             1890,422,2520000,2900,1876,14,0,0,'2026-09-18T01:00:00.000Z'),
  ('2026-09-17','/leaderboard', 1010,291,2020000,3800,1007, 3,0,0,'2026-09-18T01:00:00.000Z'),
  ('2026-09-17','/workspace',    650,210,1300000,2700, 648, 2,0,0,'2026-09-18T01:00:00.000Z'),
  ('2026-09-17','/api/sync/status',0,  0, 0,      0,    923, 0,4,0,'2026-09-18T01:00:00.000Z'),
  ('2026-09-18','/',             2020,451,2690000,3000,2004,16,0,0,'2026-09-19T01:00:00.000Z'),
  ('2026-09-18','/leaderboard', 1120,318,2240000,4200,1115, 5,0,0,'2026-09-19T01:00:00.000Z'),
  ('2026-09-18','/workspace',    710,228,1420000,2500, 707, 3,0,0,'2026-09-19T01:00:00.000Z'),
  ('2026-09-18','/api/sync/status',0,  0, 0,      0,    981, 0,3,0,'2026-09-19T01:00:00.000Z'),
  ('2026-09-19','/',             2180,481,2900000,2800,2162,18,0,0,'2026-09-20T01:00:00.000Z'),
  ('2026-09-19','/leaderboard', 1210,340,2420000,3700,1204, 6,1,0,'2026-09-20T01:00:00.000Z'),
  ('2026-09-19','/workspace',    780,245,1560000,2400, 776, 4,0,0,'2026-09-20T01:00:00.000Z'),
  ('2026-09-19','/api/sync/status',0,  0, 0,      0,   1048, 0,2,0,'2026-09-20T01:00:00.000Z'),
  ('2026-09-20','/',             2310,508,3080000,2900,2291,19,0,0,'2026-09-21T01:00:00.000Z'),
  ('2026-09-20','/leaderboard', 1290,361,2580000,3600,1283, 7,0,0,'2026-09-21T01:00:00.000Z'),
  ('2026-09-20','/workspace',    820,258,1640000,2300, 818, 2,0,0,'2026-09-21T01:00:00.000Z'),
  ('2026-09-20','/api/sync/status',0,  0, 0,      0,   1091, 0,2,0,'2026-09-21T01:00:00.000Z'),
  ('2026-09-21','/',             1260,278,1680000,2700,1250,10,0,0,'2026-09-21T12:00:00.000Z'),
  ('2026-09-21','/leaderboard',  704,198,1408000,3500, 700, 4,0,0,'2026-09-21T12:00:00.000Z'),
  ('2026-09-21','/workspace',    448,142, 896000,2200, 446, 2,0,0,'2026-09-21T12:00:00.000Z'),
  ('2026-09-21','/api/sync/status',0,  0, 0,      0,    597, 0,1,0,'2026-09-21T12:00:00.000Z');

-- ── Analytics — 7 days of engagement ──────────────────────────────────────────
INSERT OR IGNORE INTO analytics_daily_engagement (
  metric_date, repo_id, review_opens, review_closes, active_seconds, votes_submitted, updated_at
) VALUES
  ('2026-09-15',1001,42,38,124800,12,'2026-09-16T01:00:00.000Z'),
  ('2026-09-15',1002,28,24, 83400, 8,'2026-09-16T01:00:00.000Z'),
  ('2026-09-15',1003,31,27, 93000, 9,'2026-09-16T01:00:00.000Z'),
  ('2026-09-15',1004,18,16, 54000, 5,'2026-09-16T01:00:00.000Z'),
  ('2026-09-15',1005,12,10, 36000, 3,'2026-09-16T01:00:00.000Z'),
  ('2026-09-16',1001,45,40,134100,13,'2026-09-17T01:00:00.000Z'),
  ('2026-09-16',1002,30,26, 89400, 9,'2026-09-17T01:00:00.000Z'),
  ('2026-09-16',1003,33,28, 98400,10,'2026-09-17T01:00:00.000Z'),
  ('2026-09-16',1004,19,17, 56700, 6,'2026-09-17T01:00:00.000Z'),
  ('2026-09-16',1005,13,11, 38700, 4,'2026-09-17T01:00:00.000Z'),
  ('2026-09-17',1001,43,39,128700,12,'2026-09-18T01:00:00.000Z'),
  ('2026-09-17',1002,29,25, 86400, 8,'2026-09-18T01:00:00.000Z'),
  ('2026-09-17',1003,32,28, 95700, 9,'2026-09-18T01:00:00.000Z'),
  ('2026-09-17',1004,17,15, 50700, 5,'2026-09-18T01:00:00.000Z'),
  ('2026-09-17',1005,11, 9, 32700, 3,'2026-09-18T01:00:00.000Z'),
  ('2026-09-18',1001,47,42,140400,14,'2026-09-19T01:00:00.000Z'),
  ('2026-09-18',1002,32,28, 95700,10,'2026-09-19T01:00:00.000Z'),
  ('2026-09-18',1003,35,31,104400,11,'2026-09-19T01:00:00.000Z'),
  ('2026-09-18',1004,21,19, 62700, 7,'2026-09-19T01:00:00.000Z'),
  ('2026-09-18',1005,14,12, 41700, 4,'2026-09-19T01:00:00.000Z'),
  ('2026-09-19',1001,50,45,149400,15,'2026-09-20T01:00:00.000Z'),
  ('2026-09-19',1002,34,30,101400,11,'2026-09-20T01:00:00.000Z'),
  ('2026-09-19',1003,37,33,110400,12,'2026-09-20T01:00:00.000Z'),
  ('2026-09-19',1004,22,20, 65700, 7,'2026-09-20T01:00:00.000Z'),
  ('2026-09-19',1005,15,13, 44700, 5,'2026-09-20T01:00:00.000Z'),
  ('2026-09-20',1001,53,48,158400,16,'2026-09-21T01:00:00.000Z'),
  ('2026-09-20',1002,36,32,107400,12,'2026-09-21T01:00:00.000Z'),
  ('2026-09-20',1003,39,35,116400,13,'2026-09-21T01:00:00.000Z'),
  ('2026-09-20',1004,23,21, 68700, 8,'2026-09-21T01:00:00.000Z'),
  ('2026-09-20',1005,16,14, 47700, 5,'2026-09-21T01:00:00.000Z'),
  ('2026-09-21',1001,29,25, 86400, 9,'2026-09-21T12:00:00.000Z'),
  ('2026-09-21',1002,19,17, 56700, 6,'2026-09-21T12:00:00.000Z'),
  ('2026-09-21',1003,21,19, 62700, 7,'2026-09-21T12:00:00.000Z'),
  ('2026-09-21',1004,13,11, 38700, 4,'2026-09-21T12:00:00.000Z'),
  ('2026-09-21',1005, 9, 8, 26700, 3,'2026-09-21T12:00:00.000Z');

-- ── Registrations (10) ────────────────────────────────────────────────────────
INSERT OR IGNORE INTO registrations (name, email, github, role, ip_hash, created_at, updated_at) VALUES
  ('Alice Nakamura',  'alice@example.com',  'alice-dev',       'validator',  'hash001','2026-07-01T10:00:00.000Z','2026-07-01T10:00:00.000Z'),
  ('Bob Martinez',    'bob@example.com',    'bob-reviewer',    'validator',  'hash002','2026-07-05T11:00:00.000Z','2026-07-05T11:00:00.000Z'),
  ('Carol Kim',       'carol@example.com',  'carol-security',  'validator',  'hash003','2026-07-10T09:00:00.000Z','2026-07-10T09:00:00.000Z'),
  ('Dave Okonkwo',    'dave@example.com',   'dave-coder',      'validator',  'hash004','2026-07-15T14:00:00.000Z','2026-07-15T14:00:00.000Z'),
  ('Eve Larsson',     'eve@example.com',    'eve-tester',      'validator',  'hash005','2026-07-20T10:00:00.000Z','2026-07-20T10:00:00.000Z'),
  ('Frank Dubois',    'frank@example.com',  'frank-analyst',   'researcher', 'hash006','2026-08-01T09:00:00.000Z','2026-08-01T09:00:00.000Z'),
  ('Grace Patel',     'grace@example.com',  'grace-researcher','researcher', 'hash007','2026-08-05T11:00:00.000Z','2026-08-05T11:00:00.000Z'),
  ('Henry Schneider', 'henry@example.com',  'henry-hacker',    'validator',  'hash008','2026-08-10T08:00:00.000Z','2026-08-10T08:00:00.000Z'),
  ('Iris Chen',       'iris@example.com',   'iris-dev',        'validator',  'hash009','2026-08-15T15:00:00.000Z','2026-08-15T15:00:00.000Z'),
  ('Jack Williams',   'jack@example.com',   'jack-reviewer',   'validator',  'hash010','2026-08-20T10:00:00.000Z','2026-08-20T10:00:00.000Z');

-- ── Applications (3) ─────────────────────────────────────────────────────────
INSERT OR IGNORE INTO applications (email, name, github, org, why, role, ip_hash, created_at, updated_at) VALUES
  ('alice@example.com','Alice Nakamura','alice-dev',
   'Independent Security Researcher',
   'I have 5 years of web security experience and want to contribute to OWASP testing guides.',
   'contributor','hash001','2026-07-02T10:00:00.000Z','2026-07-02T10:00:00.000Z'),
  ('frank@example.com','Frank Dubois','frank-analyst',
   'CyberSec GmbH',
   'Our team uses OWASP ASVS daily and we want to give back to the community.',
   'contributor','hash006','2026-08-02T09:00:00.000Z','2026-08-02T09:00:00.000Z'),
  ('grace@example.com','Grace Patel','grace-researcher',
   'University of Edinburgh',
   'PhD student in software security, eager to apply academic research to practical testing guides.',
   'contributor','hash007','2026-08-06T11:00:00.000Z','2026-08-06T11:00:00.000Z');

-- ── HubSpot sync queue (2 synced, 1 pending) ─────────────────────────────────
INSERT OR IGNORE INTO hubspot_sync_queue (
  source_type, source_key, payload_json, status, attempts,
  next_attempt_at, synced_at, created_at, updated_at
) VALUES
  ('registration','alice@example.com',
   '{"source":"registration","email":"alice@example.com","name":"Alice Nakamura","github":"alice-dev","role":"validator","organization":"","submitted_at":"2026-07-01T10:00:00.000Z"}',
   'synced',1,'2026-07-01T11:00:00.000Z','2026-07-01T11:00:00.000Z',
   '2026-07-01T10:00:00.000Z','2026-07-01T11:00:00.000Z'),
  ('application','alice@example.com:contributor',
   '{"source":"application","email":"alice@example.com","name":"Alice Nakamura","github":"alice-dev","role":"contributor","organization":"Independent Security Researcher","submitted_at":"2026-07-02T10:00:00.000Z"}',
   'synced',1,'2026-07-02T11:00:00.000Z','2026-07-02T11:00:00.000Z',
   '2026-07-02T10:00:00.000Z','2026-07-02T11:00:00.000Z'),
  ('registration','jack@example.com',
   '{"source":"registration","email":"jack@example.com","name":"Jack Williams","github":"jack-reviewer","role":"validator","organization":"","submitted_at":"2026-08-20T10:00:00.000Z"}',
   'pending',0,'2026-08-20T11:00:00.000Z',NULL,
   '2026-08-20T10:00:00.000Z','2026-08-20T10:00:00.000Z');
