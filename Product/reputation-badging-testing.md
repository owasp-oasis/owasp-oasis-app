# Testing Response Recognition

The MVP is independent of the existing contributor reputation score.

## Automated tests

Use Node 22 from the repository root:

```bash
npm run test:badges
```

The tests cover:

- creation of a badge-eligible clock for a newly discovered PR;
- protection against reopening a responded request during synchronization;
- observation-only handling for historical PRs;
- exact 24-hour, 72-hour, and 80% boundaries;
- deterministic timestamp ties;
- exclusions for authors, cancelled clocks, early votes, and historical clocks; and
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
http://localhost:8787/workspace/contributors
```

Then:

1. Select `alice-validator`.
2. Confirm her avatar falls back to the `AV` initials instead of showing a broken image.
3. Open **Badges** and confirm First Responder and Fast Responder are earned.
4. Select `casey-coverage` and confirm Coverage Contributor is earned.
5. Return to **Score**, expand **How does the bonus multiplier work?**, and confirm the explanation is readable.
6. Confirm the existing score values are unchanged when switching between Score and Badges.

The seed uses dates relative to the time it is run, so rolling badge windows remain reproducible.

The setup command modifies only Wrangler’s local D1 database. It does not apply remote migrations or deploy the application.
Stop the preview with `Ctrl+C` when finished.

## Planned maintainer and upstream workflow

The response-recognition MVP currently demonstrates validator activity and
badges. The next workflow phase should be accepted only when it preserves the
following distinctions:

- `Accept`, `Modify`, and `Reject` remain validator decisions;
- `Changes Requested` preserves a maintainer reason and returns the candidate to
  maintainer review after revision;
- `Maintainer Accepted` means approved for upstream submission, not merged;
- `Submitted Upstream` links to a separate upstream GitHub PR;
- `Merged Upstream` is shown only after GitHub confirms the upstream merge; and
- an unmerged closed upstream PR is shown as `Closed Without Merge` unless a
  documented decline reason is available.

None of these maintainer or upstream states should change the existing
reputation score or response-badge calculations.
