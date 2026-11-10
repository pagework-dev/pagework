# Contributing

Thanks for looking. Pagework is at the planning stage, so the most useful contributions right now are comments on the documents in `docs/`, especially from people who write or produce scripts.

## Before you start

- **Open an issue first** for anything larger than a typo fix, so we can agree on the approach before you spend time on it.
- **Read the decision records** in [`docs/adr/`](docs/adr/). If your change goes against one, say so in the issue; decisions can be revisited, but deliberately, with a new record.

## Sign your commits (DCO)

Pagework uses the [Developer Certificate of Origin](https://developercertificate.org/). By signing off a commit you certify that you wrote the change, or otherwise have the right to submit it under the project's licence (AGPL-3.0-only).

Sign off with `-s`:

```sh
git commit -s -m "parser: handle forced scene headings with leading dot"
```

This adds a line to the commit message:

```
Signed-off-by: Your Name <you@example.com>
```

Pull requests with unsigned commits cannot be merged. There is no separate contributor licence agreement, and you keep the copyright in your contribution.

## Commits

- One logical change per commit.
- Message format: `area: what changed`, in the imperative, lower case, no full stop. Areas match the package or folder: `parser`, `layout`, `pdf`, `server`, `web`, `templates`, `docs`, `ci`.
- Explain *why* in the body when it isn't obvious from the diff.

## Code

- TypeScript, strict mode. No `any` without a comment explaining why.
- Every bug fix comes with a test that failed before the fix.
- Changes to parsing, pagination or PDF output must update the reference fixtures and explain any page-count change in the pull request.
- No new runtime dependency without a note in the pull request on why it is needed and what it costs (size, licence, maintenance).

## Interface

Read [docs/DESIGN.md](docs/DESIGN.md) before changing anything visible. In short: colours and type come from the tokens, every state (empty, loading, error, offline) needs designing, and copy says what happens ("Export PDF", not "Submit").

## Spelling

Documentation and interface text use Australian/British English ("colour", "organisation"). Code identifiers follow their platform's convention (`color` in CSS).

## Conduct

Be kind, be specific, assume good faith. Harassment of any kind gets you removed from the project.
