# Application authorization

OASIS uses a temporary GitHub-backed application-role system for interactive
users. Authorization is enforced by the Worker. React role checks improve the
interface, but they are never a security boundary.

This layer is intentionally small and must eventually be replaced with
capability-based permissions, stronger administrator protections, and formal
audit retention. Until then, new features must follow the contract below.

## Roles and inheritance

Roles are ordered from least to most privileged:

| Role | Level | Current purpose |
|---|---:|---|
| `guest` | 0 | Anonymous visitors and authenticated accounts explicitly restricted to guest access. |
| `member` | 1 | Default role for an authenticated GitHub user without an explicit `user_roles` row. |
| `moderator` | 2 | Reserved for future moderation capabilities; it inherits member access. |
| `admin` | 3 | Administrative dashboards, role assignment, sync controls, analytics collection, and other high-impact operations. |

`roleAllows(actual, required)` implements inheritance. For example, an admin
passes a moderator or member check. Authentication and role are separate:
an authenticated `guest` has a session, while an anonymous request does not.
Endpoints that merely require sign-in should check `principal.session`; they
should not invent a role threshold.

The role names and ordering live in `worker/authorization.ts`. The shared
`UserRole` type and session lookup live in `worker/handlers/auth.ts`.

## Identity and storage

GitHub OAuth establishes the session. D1 stores session metadata, including the
immutable GitHub user ID, but the OAuth token remains encrypted in a separate
HttpOnly cookie and is not stored in D1.

`getSession()` resolves an explicit role from `user_roles` by immutable GitHub
user ID. The login fallback exists only for sessions created before immutable
IDs were stored. An authenticated user without an explicit grant defaults to
`member`; a request without a valid session resolves to `guest`.

Role grants are stored in `user_roles` and privileged action outcomes are
stored in `privileged_action_audit`. Migration `0009_user_roles.sql` seeds
GitHub user ID `7505051` (`humor4fun`) as the first administrator.

Administrators may assign `admin`, `moderator`, `member`, or `guest` to another
registered GitHub user. The server verifies that account against GitHub before
writing the grant. Self-role changes are prohibited so an administrator cannot
accidentally remove their own access. UI fields must use the server-returned
`can_assign_role`; they must not reproduce identity rules in React.

## Required Worker pattern

Every role-protected handler must perform authorization before its protected
read or mutation. A state-changing cookie-authenticated route must also verify
CSRF before parsing or applying the requested change.

```ts
import {
  getRequestPrincipal,
  recordPrivilegedAction,
  roleAllows,
} from '../authorization.js';
import { jsonErr, jsonOk, validateCSRF } from '../security.js';

export async function handleAdminAction(request: Request, env: Env): Promise<Response> {
  const principal = await getRequestPrincipal(request, env);
  if (!principal.session) return jsonErr('Authentication required', 401, request);
  if (!roleAllows(principal.role, 'admin')) {
    return jsonErr('Admin role required', 403, request);
  }
  if (!validateCSRF(request)) return jsonErr('Invalid security token', 403, request);

  // Validate the target and request body after access is established and
  // before making a state change or dispatching background work.
  await recordPrivilegedAction(env, principal, {
    action: 'feature.action',
    targetType: 'feature_target',
    targetId: 'non-secret-stable-id',
    outcome: 'accepted',
  });

  // Perform the bounded mutation or create a Workflow and return 202.
  return jsonOk({ accepted: true }, request, { cache: 'no-store' });
}
```

Apply checks in this order:

1. Resolve the server-side principal from the session cookie.
2. Return `401` if the feature requires authentication and no session exists.
3. Return `403` if the resolved role does not meet the minimum role.
4. For `POST`, `PUT`, or another cookie-authenticated mutation, validate the
   double-submit CSRF cookie/header with `validateCSRF()`.
5. Validate identifiers, request shape, target existence, and feature-specific
   invariants on the server.
6. Record a bounded, non-secret audit event for privileged actions.
7. Perform the mutation or dispatch bounded background work.

Never accept a role, login, GitHub ID, or `is_admin` value supplied by the
browser as authorization evidence. Never authorize from the visibility of a
button. Never include OAuth tokens, API secrets, request bodies, email
addresses, or other sensitive values in audit action names or target IDs.

## React pattern

`GET /api/auth/me` returns the server-resolved role. React may use that value to
hide inaccessible navigation and controls:

```tsx
const { user } = useAuth()

{user?.role === 'admin' && (
  <button type="button" onClick={runAdminAction}>Run admin action</button>
)}
```

The API must still repeat the session, role, CSRF, target, and invariant checks.
Direct requests can bypass React entirely. An inaccessible page may redirect
for usability, but its backing API must independently return `401` or `403`.

For a mutation, fetch `/api/csrf`, send the returned token in
`x-csrf-token`, and include credentials. Do not store the token in local
storage or place it in a URL.

## Audit and asynchronous work

Use `recordPrivilegedAction()` for work completed in the request. If the
request creates a Workflow, pass only the bounded actor identity needed by the
Workflow and use `recordPrivilegedActionForActor()` for its terminal outcome.
Use stable action names such as `sync_job.retry`, `sync_job.cancel`, or
`analytics.collect` so events can be queried consistently.

An `accepted` record means the server authorized and dispatched the request; it
does not mean asynchronous work succeeded. The Workflow should record
`succeeded` or `failed` when the operation reaches a terminal state. Rejected
attempt logging may be added when useful, but must not create an unauthenticated
write-amplification path.

## `ADMIN_SECRET` boundary

`X-Admin-Secret` predates application roles and remains on a few operational or
machine-oriented endpoints. It is not an alternative login mechanism and must
not be placed in React, browser storage, URLs, examples intended for end users,
or new interactive features.

New interactive administrator features must use the GitHub session, the
server-resolved `admin` role, CSRF protection for mutations, and privileged
action auditing. A new machine-to-machine endpoint needs a separate threat
model and narrowly scoped credential; do not automatically reuse
`ADMIN_SECRET`.

## Tests required for a protected feature

Add integration coverage for every protected endpoint:

- anonymous request returns `401`;
- authenticated insufficient role returns `403`;
- missing or mismatched CSRF returns `403` for mutations;
- authorized minimum role succeeds;
- higher roles inherit access when the endpoint is below admin;
- malformed or nonexistent targets fail before mutation;
- the audit record contains the expected action, safe target, actor, role, and
  outcome;
- direct API access remains protected even when the React control is hidden;
- no credential or sensitive request data appears in responses, logs, or audit
  fields.

Role-management changes additionally need coverage for all four assignable
roles, immutable GitHub identity verification, duplicate identity conflicts,
legacy null-ID sessions, and the self-role-change prohibition.

Useful existing examples:

- `worker/handlers/adminUsers.ts` — admin read/mutation and GitHub identity verification.
- `worker/handlers/syncRetry.ts` — admin Workflow dispatch and audit actor propagation.
- `worker/handlers/syncCancel.ts` — admin mutation, CSRF, target validation, and terminal audit.
- `worker/handlers/analytics.ts` — shared admin guard for protected reads and mutations.
- `tests/worker/integration/adminUsers.test.ts` and
  `tests/worker/integration/rolesAndRetries.test.ts` — authorization regressions.

## Known temporary limitations

- Permissions are role comparisons rather than named capabilities.
- `moderator` has no moderator-specific action yet.
- There is no recent-authentication or step-up challenge for high-impact work.
- The system prohibits self-role changes but does not yet prevent removal of
  the final administrator by another administrator.
- Audit retention, review, and alerting are not yet formally defined.
- Legacy `ADMIN_SECRET` endpoints still need migration or retirement.

Do not silently work around these limitations in a feature. Document the
required expansion and add it deliberately, or defer the feature until the
authorization layer can support it safely.
