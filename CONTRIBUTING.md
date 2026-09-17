# Contributing to OWASP OASIS

Thank you for helping improve OWASP Open Source Application Security Insights
(OASIS). Contributions from first-time contributors, experienced maintainers,
and people working with AI assistants are welcome.

By participating, you agree to follow the
[OWASP Code of Conduct](https://owasp.org/www-policy/operational/code-of-conduct).
Be respectful, assume good intent, and keep technical disagreement focused on
the work.

## Choose the right place

Before opening an issue, decide which system the report concerns:

| You want to… | Use… |
|---|---|
| Report a bug in the OASIS website, API, sync jobs, or infrastructure | This repository's bug-report form |
| Propose an OASIS feature, improvement, or code change | This repository's change-proposal form |
| Improve this repository's documentation | This repository's documentation form |
| Report a possible security flaw in OASIS itself | The private process in [`SECURITY.md`](SECURITY.md); do not disclose details publicly |
| Review, vote on, or discuss a vulnerability-fix PR shown in the Workspace | The relevant OASIS Workspace PR page |
| Report a vulnerability in another open-source project | That project's security policy or coordinated-disclosure channel, not this repository's public issues |

If you are uncertain, open a change proposal with the non-sensitive context you
have. Never include credentials, tokens, personal data, exploit details, or
other sensitive material in a public issue.

## Before proposing work

1. Search the [open issues](https://github.com/owasp-oasis/owasp-oasis-app/issues),
   [pull requests](https://github.com/owasp-oasis/owasp-oasis-app/pulls), and
   [`ROADMAP.md`](ROADMAP.md) for related work.
2. Describe the user problem and desired outcome before prescribing an
   implementation.
3. Include evidence: exact reproduction steps, affected URL, environment,
   screenshots, sanitized logs, or an example workflow.
4. State acceptance criteria and important non-goals so the change can be
   reviewed objectively.

An issue is optional for an obvious typo or a small, self-contained fix. Please
open an issue and seek maintainer agreement before doing substantial work,
especially changes to authorization, privacy, analytics, database schemas,
sync orchestration, external integrations, or deployment configuration.

Opening an issue does not reserve it automatically. Comment before investing
significant effort so maintainers can confirm scope, dependencies, and whether
someone else is already working on it.

## Development setup

Start with the setup instructions in [`README.md`](README.md#local-development).
The application is a React frontend and Cloudflare Worker backed by D1 and KV.
Use local resources and test credentials; never copy production secrets or
production data into an issue, commit, test fixture, or AI prompt.

Install the exact locked dependencies:

```bash
npm ci
```

Run the application locally:

```bash
npm run dev
```

See [`TESTING.md`](TESTING.md) for targeted tests and [`DEPLOY.md`](DEPLOY.md)
for architecture and environment boundaries. Authorization-sensitive changes
must also follow [`AUTHORIZATION.md`](AUTHORIZATION.md).

## Branch and promotion workflow

Always branch from the current `main` tip. Use a short-lived, purpose-named
branch such as `feat/new-feature-name`, `fix/concise-bug-name`,
`docs/contribution-guide`, or `chore/maintenance-task`.

```bash
git switch main
git pull --ff-only
git switch -c feat/new-feature-name
```

Do not develop directly on `main` or `preview`, and do not push directly to
either long-lived branch.

Use the smallest promotion path that supplies the necessary evidence:

- If local testing is sufficient, open `feature branch -> main`.
- If the change needs a deployed Worker, real bindings, OAuth, remote D1, or
  browser validation on staging, open `feature branch -> preview`, validate it,
  and then open `preview -> main`.

Cloudflare Git integration deploys `preview` to staging and `main` to
production. GitHub Actions validates changes but does not deploy them. If
`main` changes during preview validation, reconcile those changes through a
reviewed PR and repeat affected checks. After promotion, maintainers reconcile
`preview` to the resulting `main` tip.

## Implementation expectations

Keep the change narrowly scoped and preserve unrelated work already present in
the checkout. Prefer existing components, helpers, naming, and data models over
parallel implementations.

### Frontend and user experience

- Support keyboard use, useful focus states, semantic labels, and reasonable
  screen sizes.
- Include loading, empty, success, and failure states where applicable.
- Keep views and filters URL-addressable when users may need to bookmark or
  share them.
- Include before/after screenshots or a short recording for visible changes.

### Worker APIs, authorization, and privacy

- Treat the client as untrusted. Validate all input and enforce authorization
  on the server, even when the corresponding control is hidden in the UI.
- Use the session, role, CSRF, and audit patterns in [`AUTHORIZATION.md`](AUTHORIZATION.md)
  for protected actions. `ADMIN_SECRET` is not browser authorization.
- Return safe errors and avoid logging secrets, tokens, contact information, or
  sensitive request bodies.
- Outside a user's own profile or contributor panel, analytics and engagement
  reporting must not identify individual users.

### D1 schemas and migrations

- Add a forward migration in `migrations/` and update `schema.sql` so fresh
  databases and upgraded databases converge on the same schema.
- Prefer additive, retry-safe migrations and code that tolerates a staged
  rollout when practical.
- Test the migration locally and document its rollback or forward-repair plan.
- Do not apply a remote migration unless a maintainer explicitly authorizes the
  exact environment and command.

### Sync jobs, scheduled work, and integrations

- Keep work bounded within Cloudflare request, CPU, API, and operation budgets.
- Make jobs idempotent and retry-safe; record granular progress and actionable
  failures.
- Preserve the status-page observability contract for job and pipeline status.
- Document required bindings, variables, and secrets without committing their
  values.

### Documentation

- Use repository-relative links for repository files and verify external links.
- Test commands before publishing them and state their environment and side
  effects.
- Update nearby docs when behavior, configuration, routes, roles, or operations
  change.

## Tests and verification

Run targeted tests while developing, then run the complete required check
before requesting review:

```bash
npm run check
```

That command runs the test suite and production builds. Add or update tests for
new behavior and regressions. A successful build alone is not proof of runtime
or visual behavior; test at the boundary the change affects.

In the PR, list the exact commands and manual checks performed. If a check
cannot run, explain why, include the error, and identify the remaining risk.
Do not describe an unperformed check as passing.

## Commits

Each commit must be a coherent unit that can be reviewed and reverted without
discarding unrelated work. Avoid mixing formatting, refactors, generated files,
and behavior changes unless they are inseparable.

Use an imperative subject and a detailed body covering:

- why the change is needed;
- what behavior it produces;
- how it was verified; and
- what reverting the commit would undo or require.

For example:

```text
Document contributor intake and promotion paths

Explains where bugs, feature proposals, application-security reports, and
upstream vulnerability reports belong so contributors do not disclose private
information or bypass preview validation.

Adds structured issue and pull-request guidance and links the repository's
existing testing, authorization, and deployment contracts.

Verified with npm run check and manual link review. Reverting this commit
removes contributor guidance only and does not change runtime behavior.
```

Do not bump the application version, release tag, onboarding version, or
changelog unless the issue or a maintainer specifically includes release work
in the change. Maintainers assign release versions.

## Pull requests

Complete the pull-request template. A reviewable PR includes:

- a concise problem statement and resulting behavior;
- a linked issue when one exists (`Closes #123` for work that resolves it);
- important design decisions and alternatives;
- authorization, privacy, data, migration, configuration, and deployment
  impact;
- exact automated and manual verification results;
- screenshots for visible changes;
- rollout and rollback notes; and
- disclosure of substantial AI assistance and what the contributor personally
  reviewed and verified.

Keep the PR focused. Respond to reviews with new commits while review is active;
maintainers may squash or rebase at merge time. Do not force-push after review
has started unless reviewers agree.

Approval is not deployment approval. Merging into a deployment branch causes
Cloudflare to deploy that branch, so maintainers control merges and production
timing.

## Contributors using AI agents

AI assistance is welcome, but the human contributor remains responsible for
the entire submission. Give the agent this repository's [`AGENTS.md`](AGENTS.md)
and relevant project documentation as its operating contract.

Before submitting AI-assisted work:

- inspect every change rather than accepting generated output wholesale;
- verify behavior, security, privacy, accessibility, and third-party licensing;
- make sure no secret or private data entered a prompt, log, fixture, or commit;
- remove fabricated APIs, tests, citations, and claims;
- run the same checks required for human-written work; and
- state what AI helped with and what a person validated in the PR.

An agent must not deploy, migrate a remote database, change managed secrets,
merge a PR, delete branches, or otherwise modify external state unless an
authorized maintainer explicitly requests that exact action.

## Review and follow-up

Maintainers review for correctness, scope, security, privacy, accessibility,
operational safety, test evidence, and consistency with the roadmap. They may
request changes, split a proposal, close work that no longer fits, or ask for
preview validation.

After merge, monitor the relevant deployment or job status when the change has
runtime effects. If you discover a regression, report it promptly with the PR
number and sanitized evidence.
