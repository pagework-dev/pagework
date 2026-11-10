# Working on Pagework with Claude Code

Instructions for AI coding agents working in this repository. Humans may find it useful too.

## Read before changing anything

1. `docs/ARCHITECTURE.md`: what lives where.
2. `docs/adr/`: decisions already made. Do not quietly work around one. If a task seems to need a different decision, stop and say so; a change of direction gets a new ADR.
3. `docs/DESIGN.md` before touching anything visible.
4. `docs/TEMPLATES.md` before touching layout, pagination or templates.

## Ground rules

- **Small, reviewable changes.** One logical change per commit. Do not bundle refactors with features.
- **Commit messages** follow `area: what changed` (see CONTRIBUTING.md). Commits are made and signed off (`git commit -s`) by the human maintainer, who is responsible for them; include a `Co-Authored-By` trailer for the AI.
- **Tests first for the core packages.** Parser, layout and PDF changes start with a failing fixture or test.
- **Never guess formatting rules.** Margins, indents, page-break and (CONT'D) behaviour come from templates and reference fixtures, not from memory. If a rule is unclear, ask.
- **No new dependencies without asking.** State the package, its size and licence, and why the standard library or existing code isn't enough.
- **Performance budgets are requirements** (see ARCHITECTURE.md). Don't add work to the keystroke path.
- **No placeholder content.** No invented statistics, testimonials, sample users or fake data in the UI or docs. Sample scripts must be original or public domain.
- **No generative AI, and script content never leaves the server** (ADR 0010). Do not add AI integrations of any kind without a new ADR.
- **Never write continuation markers into script text** (ADR 0011). `(MORE)`, `(CONT'D)` and `CONTINUED` come from the paginator only; importers strip them.
- **No telemetry, no third-party requests.** No analytics, no CDN assets, no external fonts. The app talks to its own server only.
- **No literal interface strings in components.** All user-facing text goes in the translation files.

## Style

- TypeScript strict. Prefer plain functions and data over classes, except where a library expects classes.
- Name things after the screenwriting concept they model (`sceneHeading`, `dialogueBlock`), not after implementation details.
- Comments explain *why*. Don't narrate what the code does.
- Australian/British English in docs and UI text.

## Interface work

Follow `docs/DESIGN.md`: tokens only (no raw hex in components), system UI font, Courier Prime only on the script page, every empty/loading/error/offline state designed, copy that names the action. Run the self-audit checks listed in DESIGN.md before calling UI work done.
