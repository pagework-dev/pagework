# Architecture decision records

Each record captures one decision: the context, what was decided, and what it costs. Records are never edited after they are accepted, except to fix typos or mark them superseded. To change a decision, write a new record that supersedes the old one.

| No. | Decision | Status |
|---|---|---|
| [0001](0001-record-decisions.md) | Record architecture decisions | Accepted |
| [0002](0002-licence.md) | AGPL-3.0-only, DCO, attribution notice | Accepted |
| [0003](0003-typescript-end-to-end.md) | TypeScript end to end, shared parser and paginator | Accepted |
| [0004](0004-fountain-as-source.md) | Fountain text is the source of truth | Accepted |
| [0005](0005-yjs-from-day-one.md) | Store documents as Yjs from the first version | Accepted |
| [0006](0006-database.md) | SQLite by default, PostgreSQL optional, Kysely | Accepted |
| [0007](0007-templates-as-data.md) | Script formats are data files with inheritance | Accepted |
| [0008](0008-deployment-modes.md) | One codebase, three deployment modes | Accepted |
| [0009](0009-frontend.md) | Svelte 5 and CodeMirror 6, with performance budgets | Accepted |
| [0010](0010-no-ai-features.md) | No generative AI; script content stays on the server | Accepted |
| [0011](0011-continuation-markers-render-only.md) | Continuation markers exist only when rendering | Accepted |
| [0012](0012-instance-and-org-admins.md) | Separate instance admins from organisation admins | Accepted |

## Template

```markdown
# NNNN. Title

- Status: Proposed | Accepted | Superseded by NNNN
- Date: YYYY-MM-DD

## Context
## Decision
## Consequences
## Alternatives considered
```
