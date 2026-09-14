# Instructions for AI Coding Agents

This file is the repository-level operating contract for AI agents. Human
contributors remain accountable for all agent-produced work.

## Read before changing files

1. Read [`CONTRIBUTING.md`](CONTRIBUTING.md).
2. Read [`README.md`](README.md) and [`TESTING.md`](TESTING.md).
3. For role-protected behavior, read [`AUTHORIZATION.md`](AUTHORIZATION.md).
4. For Cloudflare configuration, migrations, or operations, read
   [`DEPLOY.md`](DEPLOY.md).
5. Inspect the current branch, worktree, relevant code, tests, and recent
   history before proposing or applying a change.

## Working rules

- Start from current `main` on a short-lived `feat/`, `fix/`, `docs/`, or
  `chore/` branch. Never develop directly on `main` or `preview`.
- Preserve unrelated changes and untracked files. Do not overwrite, discard,
  stage, or commit work whose ownership and purpose you have not established.
- Keep scope aligned with the issue or human request. Report adjacent concerns
  instead of silently expanding the change.
- Search for and reuse existing components, helpers, authorization checks, data
  models, routes, and tests.
- Treat all client input as untrusted. Enforce authorization and validation on
  the server and follow `AUTHORIZATION.md` for protected actions.
- Never read into output, expose, commit, or place in a prompt any secret,
  credential, token, production record, or private user data.
- Do not identify an individual user in analytics or engagement output outside
  that user's own profile or contributor panel.
- Keep Cloudflare work bounded, idempotent, retry-safe, and observable. Update
  `schema.sql` with every D1 migration.

## Authority boundary

Local edits and non-mutating inspection are permitted when they are part of the
assigned task. Do not deploy, merge pull requests, apply remote migrations,
change secrets or repository settings, send external messages, delete branches,
or perform other external or destructive actions unless an authorized human
explicitly requests that exact action.

Do not treat access to a credential or tool as authorization to use it.

## Verification

- Add or update tests for behavior changes and regressions.
- Run targeted tests during development and `npm run check` before handoff.
- Exercise the affected runtime, browser, migration, authorization, or external
  boundary when a build alone cannot prove the behavior.
- Report commands and results accurately. Preserve and explain failures and
  unverified assumptions.

## Commits and pull requests

- Make atomic, independently reversible commits.
- Use a concise imperative subject and a detailed body explaining rationale,
  resulting behavior, verification, and rollback scope.
- Do not include generated `dist/` or `dist-worker/` output.
- Do not bump versions or release notes unless release work was requested.
- Follow the pull-request template, disclose substantial AI assistance, and
  identify what a human reviewed and verified.
- Use `branch -> main` when local evidence is enough. Use
  `branch -> preview -> main` when remote validation is required.

When instructions conflict, follow the authorized human's current request,
repository security and privacy requirements, and then the more specific
repository documentation. Call out unresolved conflicts rather than guessing.
