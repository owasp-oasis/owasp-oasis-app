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
│   └── security.test.ts         # CSRF, encryption, headers (~50 tests)
└── integration/                 # Full handler tests (real workerd + in-memory D1/KV)
    ├── helpers.ts               # applySchema, cleanDB, createTestSession, test data factories
    ├── router.test.ts           # Request dispatch, method validation, CORS
    ├── register.test.ts         # POST /api/register
    ├── auth.test.ts             # OAuth flow (with GitHub API mocks)
    ├── preferences.test.ts      # GET/PUT /api/preferences/mine (tests PUT method fix)
    ├── vote.test.ts             # POST /api/vote
    ├── leaderboard.test.ts      # GET /api/leaderboard/* endpoints
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

**`leaderboard.test.ts`**
- GET /api/leaderboard/meta → sync status
- GET /api/leaderboard/repos → repo list, filtering, sorting
- GET /api/leaderboard/repos/:name → repo detail with PRs & contributors
- GET /api/leaderboard/prs → PR list
- GET /api/leaderboard/contributors → contributor list with scores
- GET /api/contributors/:login → contributor detail with bonus computation
- GET /api/leaderboard/maintainers → maintainer stats
- GET /api/leaderboard/tools → tool cards

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
