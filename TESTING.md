# Testing Guide — OWASP OASIS

This document describes the test suite for the OWASP OASIS Cloudflare Worker + D1 backend.

## Quick Start

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run only unit tests
npm run test:unit

# Run only integration tests
npm run test:int

# Generate coverage report
npm run test:coverage
```

## Architecture

The test suite uses **Vitest** with **`@cloudflare/vitest-pool-workers`** to run tests inside the actual **workerd** runtime. This means:

- All tests run in the real Cloudflare Workers V8 environment (not mocked)
- D1 database is in-memory during tests
- KV namespace is in-memory during tests
- GitHub API calls are mocked via `fetchMock` from `cloudflare:test`
- No ASSETS binding is available (tests only hit `/api/` routes)

## File Structure

```
tests/worker/
├── types.d.ts                   # Type references for @cloudflare/vitest-pool-workers
├── unit/                        # Pure function tests (no D1/KV)
│   ├── validation.test.ts       # Input validation (~60 tests)
│   ├── github.test.ts           # GitHub parsers (~80 tests)
│   ├── responseBadges.test.ts   # Response-recognition thresholds and evidence
│   └── security.test.ts         # CSRF, encryption, headers (~50 tests)
└── integration/                 # Full handler tests (real workerd + in-memory D1/KV)
    ├── helpers.ts               # applySchema, cleanDB, createTestSession, test data factories
    ├── router.test.ts           # Request dispatch, method validation, CORS
    ├── register.test.ts         # POST /api/register
    ├── auth.test.ts             # OAuth flow (with GitHub API mocks)
    ├── preferences.test.ts      # GET/PUT /api/preferences/mine (tests PUT method fix)
    ├── vote.test.ts             # POST /api/vote
    ├── workspace.test.ts        # GET /api/workspace/* endpoints
    ├── responseBadges.test.ts   # Availability clocks, exclusions, and profile badges
    └── prPanel.test.ts          # GET /api/pr-panel/:id/* endpoints
```

## Configuration

### `wrangler.test.toml`
Test-specific Wrangler configuration:
- Uses in-memory D1 (database_id: `00000000-0000-0000-0000-000000000000`)
- Uses in-memory KV (id: `00000000000000000000000000000000`)
- No ASSETS binding
- Test secrets (safe fake values)

### `vitest.config.ts`
Vitest configuration using the `workers` pool:
- References `wrangler.test.toml` for test environment
- Includes all test files in `tests/**/*.test.ts`

## Test Organization

### Unit Tests

Pure, synchronous functions with no external dependencies:

**`validation.test.ts`** (~60 tests)
- `sanitize()` — HTML stripping, control character removal, type coercion
- `vEmail()`, `vName()`, `vGitHub()`, `vRole()` — input validation
- `parseBody()` — JSON parsing, Content-Type validation
- `hashString()` — SHA-256 hashing

**`github.test.ts`** (~80 tests)
- `parseDecision()` — extract accept/modify/reject/duplicate from OASIS template
- `parseDuplicateParent()` — extract parent PR number from table
- `parseDetectionTool()`, `normaliseToolName()` — tool name parsing
- `isAutomatedAccount()`, `isValidatorBot()` — bot detection
- `reactionPolarity()`, `parseGitHubUrl()` — utility parsers

**`security.test.ts`** (~50 tests)
- `generateCSRF()` — 64-char hex token generation
- `getCookieValue()` — cookie parsing from headers
- `validateCSRF()` — constant-time CSRF token comparison
- `encryptToken()` / `decryptToken()` — AES-256-GCM token encryption
- `secHeaders()` — security header injection
- `handleOptions()` — CORS preflight handling
- `ALLOWED_METHODS` — confirm PUT is now in the set

### Integration Tests

Full handler tests with real workerd + in-memory D1/KV:

**`router.test.ts`**
- Method validation (405 for unsupported methods)
- GET /api/count
- OPTIONS handling
- Security headers on all responses
- CORS behavior (allowed/disallowed origins)
- PUT method availability (bug fix verification)

**`register.test.ts`**
- Valid registration (email, name, github, role)
- Email validation (format, blocked domains, duplicates, max length)
- GitHub username validation (format, @prefix stripping, hyphens)
- Role validation (valid values: validator, sponsor, general, empty)
- CSRF protection
- Rate limiting (5 req/60s per IP)

**`auth.test.ts`** (with GitHub API mocking)
- GET /api/auth/login → redirect to GitHub OAuth
- GET /api/auth/callback → full OAuth flow
  - State validation
  - Token exchange (mocked)
  - User fetch (mocked)
  - Email fetch (mocked)
  - Session creation in D1
  - Registration upsert
- GET /api/auth/me → return user data or null
- POST /api/auth/logout → delete session, clear cookies

**`preferences.test.ts`** (includes PUT method fix verification)
- GET /api/preferences/mine → return user prefs + current_version
- PUT /api/preferences/mine → save languages, severities, experience
- Partial updates (only update specified fields)
- Preserves created_at on update
- Empty arrays and null values
- **Explicit test: PUT method is now reachable (405 not returned)**

**`vote.test.ts`** (with GitHub comment POST mocking)
- POST /api/vote → accept/modify/reject/duplicate
- CSRF & authentication validation
- Closed PR rejection
- Duplicate vote prevention
- D1 updates (user_votes, pull_requests consensus, pr_participants)
- Rate limiting (5 votes/60s per user)

**`workspace.test.ts`**
- GET /api/workspace/meta → sync status
- GET /api/workspace/repos → repo list, filtering, sorting
- GET /api/workspace/repos/:id → repo detail with PRs & contributors, addressed by immutable GitHub repository ID
- GET /api/workspace/prs → PR list
- GET /api/workspace/contributors → contributor list with scores
- GET /api/contributors/:login → contributor detail with bonus computation
- GET /api/workspace/maintainers → maintainer stats
- GET /api/workspace/tools → tool cards

**`responseBadges.test.ts`**
- New open PR availability starts an eligible response clock
- Historical PRs remain observation-only
- First, fast, and unattended coverage thresholds
- Deterministic ties and author/cancellation/time exclusions
- Existing reputation fields remain unchanged

**`prPanel.test.ts`** (with GitHub API mocking)
- GET /api/pr-panel/:id/details → parse PR metadata (CWE, severity, etc.)
- GET /api/pr-panel/:id/files → file list with diff stats
- GET /api/pr-panel/:id/comments → comments with parsed OASIS decisions
- POST /api/pr-panel/:id/react → add reaction to comment (user token)

## Test Helpers

**`tests/worker/integration/helpers.ts`**

- `applySchema(env)` — applies full D1 schema
- `cleanDB(env)` — deletes all rows from all tables (for test isolation)
- `setupFull(env)` — `beforeAll(applySchema) + beforeEach(cleanDB)` for full isolation
- `setupFast(env)` — `beforeAll(applySchema)` only for per-file speed
- `makeCsrf()` — generates valid 64-char hex CSRF token
- `createTestSession(env)` — inserts session, returns session+token cookies
- `buildCookieHeader(...cookies)` — builds Cookie header from Set-Cookie strings
- `insertTestRepo(env, overrides)` — factory for test repo
- `insertTestPR(env, overrides)` — factory for test PR
- `insertTestRegistration(env, overrides)` — factory for registration

## Coverage Gaps (Mock Fetch Limitation)

The integration tests use `fetchMock` from `cloudflare:test` to mock all GitHub API calls. This is acceptable because:

1. **Unit tests** verify our parsing logic is correct (how we handle GitHub responses)
2. **Integration tests** verify our handlers work end-to-end with mocked GitHub
3. **E2E tests** (Playwright, planned for Phase 2) will test real GitHub integration

### Not covered by worker tests:
- Real GitHub OAuth token generation/validation
- Real GitHub API rate limiting (429 responses)
- Real GitHub API format changes
- Network errors to `api.github.com`
- Real GitHub comment character limits
- GitHub's reactions API validation
- ASSETS binding fallback (SPA routing)
- localhost CORS headers (ALLOWED_ORIGINS only includes HTTPS production domains)

## Running Tests

### All Tests
```bash
npm test
```

### Watch Mode
```bash
npm run test:watch
```

### Unit Tests Only
```bash
npm run test:unit
```

### Integration Tests Only
```bash
npm run test:int
```

### With Coverage
```bash
npm run test:coverage
```

### Specific Test File
```bash
npx vitest run tests/worker/unit/validation.test.ts
```

### Specific Test Case
```bash
npx vitest run tests/worker/unit/validation.test.ts -t "sanitize"
```

## Key Testing Decisions

### 1. Per-Test Isolation
Tests use `beforeEach(cleanDB)` to ensure fresh DB state. This is slower (~500ms per test) but catches state leakage bugs. For speed, comments show how to use `beforeAll(applySchema)` only.

### 2. Real Workerd Runtime
Tests run in the actual Cloudflare Workers V8 environment via `@cloudflare/vitest-pool-workers`. This means:
- Web Crypto API is real (not mocked)
- D1 SQL execution is real
- KV operations are real
- Fetch interception works via `cloudflare:test` utilities

### 3. Mock Fetch for GitHub
All outbound `fetch` calls to `api.github.com` are intercepted by `fetchMock`. This allows:
- Testing full auth flow without real GitHub account
- Testing error paths (bad state, network failure simulation)
- Deterministic test execution

### 4. CORS Limitation
Tests run with `Origin: http://localhost` by default. ALLOWED_ORIGINS list only includes HTTPS production domains. This is documented in test files and is acceptable because:
- API responses are validated regardless of CORS headers
- CORS behavior is tested explicitly by passing valid Origin headers
- Real browsers will use HTTPS origins which are in the whitelist

## PUT Method Fix

The test suite includes specific verification that the PUT method bug is fixed:

**File:** `tests/worker/integration/preferences.test.ts`
**Test:** `PUT method is now allowed (bug fix confirmed)`
**What it does:** Confirms that `PUT /api/preferences/mine` returns 200, not 405

This test would have failed before the fix (ALLOWED_METHODS didn't include PUT).

## Future Enhancements

### Phase 2 (E2E Tests)
Playwright tests covering critical user flows with real GitHub integration:
- OAuth sign-in with real account
- PR creation and voting
- Leaderboard navigation
- Onboarding modal

### Frontend Tests
Vitest + `@testing-library/react` for React components:
- RegisterForm, Nav, OnboardingModal
- PRsTab, ProjectsTab
- AuthContext state management

### Load & Performance Tests
k6 or Artillery for:
- Rate limiting behavior under load
- Leaderboard query performance
- Sync cron scalability

## Google Sheets workflow privacy

Run `python3 tests/scripts/test_sheets_workflow.py` to execute the export
workflow shell steps with synthetic contact data and a mock HTTP client.
These checks verify that success and failure paths never print contact data,
that only aggregate counts are reported, and that failed registration fetches
stop the step. GitHub validation runs this check separately from `npm run check`.

## Local severity review

Run the complete local review harness:

```bash
npm run preview:severity
```

Open `http://localhost:8791/workspace/fixes?layout=table&all=1`. The local
banner provides Medium, High, and Unknown filter links. This harness uses
isolated D1, the real repository sync, and the real list/detail/file/comment
handlers. Only the GitHub boundary is mocked; every outbound Worker request
outside that fixture boundary is blocked, and the HTTP server accepts reads only.
Severity values are generated by sync, not inserted into the fixtures.

The synthetic reports emulate the public XWiki and OFBiz AppSecAI formats:
inline `Medium severity` finding bullets, a separate `Severity: Medium` field,
and grouped finding tables. They include legacy Critical/High/Low titles,
conflicting body values to test title precedence, a mixed Medium/High group,
and an undeclared severity with High confidence. Expected results are:

- All: 9 candidates, sorted Critical, High, Medium, Low, Unknown.
- Medium: 4 candidates; High: 2; Unknown: 1.
- Open each candidate and compare the panel severity with Details.
- Diff loads a synthetic Java patch and Comments loads an empty discussion.

No production records or credentials are used. `scripts/severity-fixtures.mjs`
is shared by the browser harness and parser regression tests. The harness
asserts every database severity after running real sync before starting its
HTTP server. Unit and integration tests additionally cover queue preferences,
backfilling unedited PRs across chunk boundaries without modifying votes, and
skipping the historical pass after it completes.

Existing installations must apply `0017_candidate_severity.sql` before using
this build. Do not reapply that migration after creating the current schema.
The normal repository sync backfills explicit severity metadata once per
repository in bounded chunks; findings with no declared severity stay unknown.

### Summary regression in the same preview

The first two XWiki-format fixtures deliberately have an empty `## TL;DR`
followed by `## What we found`, matching the structure that produced raw Markdown
in the deployed Summary. Open XWiki-format #1 with `tab=summary`: expect a
“What we found” label, separate bullets, bold field labels, and inline code.
The long Java path should wrap inside the panel. It must not show raw `##`,
`**`, or backtick delimiters. OFBiz-format #1 supplies a valid bulleted TL;DR;
legacy fixtures retain ordinary prose TL;DRs. Summary extraction and rendering
have focused unit tests; the preview also asserts each real details response's
brief source during bootstrap.
