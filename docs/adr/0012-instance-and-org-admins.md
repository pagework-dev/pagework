# 0012. Separate instance admins from organisation admins

- Status: Accepted
- Date: 2026-11-10

## Context

Team-mode servers need directory-style account administration: disabling accounts, resetting passwords, unlocking, signing people out. In the hosted service, one account can belong to several organisations, run by different people. If an organisation's admin could change an account itself, they could lock someone out of organisations they don't run.

Directory tools often let admins set a user's password directly. That means an admin knows, or chose, another person's password.

## Decision

- **Two admin levels.** Instance admins manage accounts across the server. Organisation admins manage only membership and roles within their organisation, never the account itself.
- In `hosted` mode, instance-admin powers belong only to the operator.
- **Admins never see or set passwords.** Resets work through single-use links, sent by email or handed over by the admin, after which the user chooses their own password.
- **Disable, don't delete.** Disabling ends all sessions and blocks sign-in but keeps the person's work. Deleting requires transferring their scripts first.
- At least one active instance admin always exists.
- Every admin action is audited.

## Consequences

- Safe for multi-organisation accounts in the hosted service.
- Resets take a step more than typing a new password, which is the point.
- Two sets of permission checks, both covered by tests, including attempts by organisation admins to act on accounts.

## Alternatives considered

- **Single admin role:** simpler, but unsafe once accounts span organisations.
- **Admin-set passwords:** familiar from directory tools, but means admins know users' passwords.
