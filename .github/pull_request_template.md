## Outcome

Describe the problem and the resulting user-visible or operational behavior.

Closes #

## Change type

- [ ] Bug fix
- [ ] Feature or improvement
- [ ] Documentation
- [ ] Refactor or maintenance
- [ ] Authorization, privacy, or security
- [ ] D1 schema or migration
- [ ] Sync job, integration, or Cloudflare configuration

## Implementation and decisions

Summarize the approach, important tradeoffs, alternatives considered, and
explicit non-goals. Keep this focused on information a reviewer cannot learn
quickly from the diff.

## Risk and operational impact

- Authorization or role changes:
- Privacy, analytics, or user-data changes:
- Migration or stored-data changes:
- New or changed bindings, variables, or secrets (names only, never values):
- API, Cloudflare, or operation-budget impact:
- Deployment or compatibility considerations:

Use `None` where an item does not apply.

## Verification

List exact commands and their results:

```text
npm run check
```

Describe manual, browser, API, migration, authorization, or preview checks. If
anything could not be tested, include the failure and remaining risk.

## Visual evidence

Add before/after screenshots or a short recording for visible changes, or state
`Not applicable`.

## AI assistance

- [ ] No substantial AI assistance was used.
- [ ] AI assistance was used and is described below.

State what the AI assisted with and what the human contributor personally
reviewed and verified.

## Rollout and rollback

State whether this can merge directly to `main` after local validation or needs
`preview` validation. Explain monitoring, data migration, feature activation,
and the safest rollback or forward-repair path.

## Contributor checklist

- [ ] I read and followed `CONTRIBUTING.md` and any relevant specialized docs.
- [ ] The PR is focused and its commits are atomic and independently reversible.
- [ ] Commit messages explain rationale, behavior, verification, and rollback scope.
- [ ] I added or updated tests for changed behavior, or explained why none are needed.
- [ ] I updated nearby docs and both the migration and `schema.sql` when applicable.
- [ ] I did not commit generated build output, credentials, secrets, or private data.
- [ ] I enforced protected behavior on the server, not only in the UI.
- [ ] I documented unverified assumptions, failed checks, and remaining risks.
