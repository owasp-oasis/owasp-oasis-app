# Testing Response Recognition

The MVP is independent of the existing contributor reputation score.

## Automated tests

Use Node 22 from the repository root:

```bash
npm run test:badges
```

To exercise the maintainer and upstream workflow directly:

```bash
npm run test:workflow
```

The tests cover:

- creation of a badge-eligible clock for a newly discovered PR;
- protection against reopening a responded request during synchronization;
- historical validation and first-response credit without invented response times;
- exact 24-hour, 72-hour, and 80% boundaries;
- deterministic timestamp ties;
- exclusions for authors and cancelled requests, and timed-badge exclusion for early votes and historical clocks; and
- unchanged `base_reputation` and `modified_reputation` fields.

Run the complete repository verification before review:

```bash
npm run check
```

## Local visual demo

After installing dependencies, one command builds the app, creates evergreen
local demo data, and starts the preview:

```bash
npm ci
npm run demo:badges
```

Open the local URL printed by Wrangler, normally:

```text
http://localhost:8787/workspace/validators
```

Then:

1. Select `alice-validator` and confirm her avatar falls back to the `AV` initials instead of showing a broken image.
2. In her profile, confirm Validation Contributor, First Responder, and Fast Responder are earned, while Coverage Contributor shows progress.
3. Select `casey-coverage` and confirm Coverage Contributor is earned.
4. Confirm the badges and score details remain readable at desktop and mobile widths without horizontal page overflow.
5. In **Workspace → Projects**, open a project contributor and confirm the slide-out **Badges** tab uses the same four cards.

The seed uses dates relative to the time it is run, so rolling badge windows remain reproducible.

The setup command modifies only Wrangler’s local D1 database. It does not apply remote migrations or deploy the application.
Stop the preview with `Ctrl+C` when finished.

## Maintainer and upstream workflow

The workflow is available through the PR panel's **Workflow** tab. It preserves
the following distinctions:

- `Accept`, `Modify`, and `Reject` remain validator decisions;
- `Changes Requested` preserves a maintainer reason and returns the candidate to
  maintainer review after revision;
- `Maintainer Accepted` means approved for upstream submission, not merged;
- `Submitted Upstream` links to a separate upstream GitHub PR created only
  after explicit confirmation;
- `Merged Upstream` is shown only after GitHub confirms the upstream merge; and
- an unmerged closed upstream PR is shown as `Closed Without Merge` unless a
  documented decline reason is available.

The integration suite also verifies authorization, CSRF protection, idempotent
decision submission, append-only decision history, upstream branch/SHA
linkage, upstream review requests, and merge projection. None of these
maintainer or upstream states changes the existing reputation score or
response-badge calculations.
