# 0003. TypeScript end to end, shared parser and paginator

- Status: Accepted
- Date: 2026-11-10

## Context

Writers judge screenwriting software by whether its page count is right. If the editor shows 98 pages and the PDF has 101, the tool is not trusted. That only stays true if the code that decides page breaks while writing is the same code that produces the PDF.

The editor runs in a browser, so that code must run in JavaScript. The server must run it too, for exports and previews.

## Decision

The whole project is TypeScript (strict mode), in a pnpm workspace. The Fountain parser (`packages/fountain`) and the pagination engine (`packages/layout`) are pure, platform-independent packages used unchanged by the browser app and the server.

The server runs on Node.js (current LTS) with the Hono web framework.

## Consequences

- One implementation of the formatting rules, tested once.
- PDF export can also run in the browser, which allows export while offline.
- The maintainer's strongest language is Python; maintaining TypeScript is a real cost. It is offset by strict typing, thorough tests on the core packages, and documentation.
- Node's ecosystem brings dependency risk; new dependencies need justification (CONTRIBUTING.md).

## Alternatives considered

- **Python server (Flask/FastAPI) with a TypeScript editor:** two implementations of pagination that would drift apart.
- **Rust compiled to WebAssembly for the core:** fast and shareable, but much harder to contribute to, and the parser is not the bottleneck.
- **Bun or Deno instead of Node:** viable, but Node LTS is the most predictable for self-hosters and container images. Revisit later if there's a clear gain.
