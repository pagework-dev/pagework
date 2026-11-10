# 0008. One codebase, three deployment modes

- Status: Accepted
- Date: 2026-11-10

## Context

Pagework has three audiences: one writer on their own server, a group sharing a server, and customers of a possible hosted service. Maintaining separate editions would split effort and invite "open core" features held back from self-hosters.

## Decision

One codebase and one Docker image. `PAGEWORK_MODE` selects:

- **`personal`:** one account created at first run, one organisation, no sign-up or invitations. Login is still required, since instances are often exposed through tunnels.
- **`team`:** organisations, invitations, roles (owner, admin, writer, commenter, reader) and an audit log. Sign-up is off by default.
- **`hosted`:** `team` plus public sign-up, quotas and billing. Billing is a separate module behind an interface, loaded only in this mode.

Every table holding user content has an `org_id` from the first migration, and all content queries go through one helper that scopes them to the caller's organisation.

## Consequences

- No features are held back from self-hosters; the hosted service sells hosting, not features.
- Personal mode carries some unused team machinery (an organisation table with one row). The cost is small and makes upgrading to team mode a configuration change.
- Organisation isolation is security-critical and is covered by dedicated tests.
- Moving from `personal` to `team` is supported; moving back is not.

## Alternatives considered

- **Separate personal and server editions:** duplicated code and diverging behaviour.
- **Multi-tenancy added later:** retrofitting `org_id` into every table and query is a known source of data-leak bugs.
- **Closed hosted-only features:** conflicts with the licence's purpose (ADR 0002).
