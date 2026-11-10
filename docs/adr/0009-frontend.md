# 0009. Svelte 5 and CodeMirror 6, with performance budgets

- Status: Accepted
- Date: 2026-11-10

## Context

The editor must stay responsive with long scripts on low-end hardware: the reference device is a 4 GB Chromebook. It must also work on iPad Safari and on phones. Typing latency is the measure writers feel most.

## Decision

- **Editor: CodeMirror 6.** Plain-text editing with decorations matches ADR 0004. It handles large documents through viewport rendering, works well with on-screen keyboards, and has a maintained Yjs binding.
- **Interface: Svelte 5**, compiled with Vite. Svelte compiles components to direct DOM updates with a small runtime, which keeps the bundle and the work per update low.
- **Budgets enforced in CI** (Chromium with 4× CPU throttling): first page of a 120-page script in under 1 s; keystroke to screen under 16 ms; full re-pagination under 150 ms off the keystroke path; under 150 KB compressed JavaScript for the editor screen.
- Pagination runs after typing pauses or in a Web Worker, never synchronously on each keystroke.

## Consequences

- A smaller contributor pool than React, offset by Svelte's simpler model.
- Budgets make some features harder (for example, rich previews on every keystroke). That is intended.
- The interface follows `docs/DESIGN.md`: system fonts in the UI, so no web-font download apart from Courier Prime for the page.

## Alternatives considered

- **React:** larger runtime and more work per update; the maintainer's familiarity is about the same.
- **Plain TypeScript with no framework:** smallest bundle, but more hand-written state management across many screens.
- **ProseMirror or Lexical as the editor:** built for structured documents, which conflicts with Fountain as the source (ADR 0004).
