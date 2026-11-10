# 0004. Fountain text is the source of truth

- Status: Accepted
- Date: 2026-11-10

## Context

Script editors either store a structured document (a tree of typed paragraphs, as Final Draft does) or plain text with markup. Writers care about owning their work, moving between apps and keeping files readable for decades. Developers care about diffs, merging and simple storage.

Fountain is an open, widely supported plain-text screenplay format. Several established apps (Highland, Beat, Slugline, Fade In) read and write it.

## Decision

A script's content is Fountain text. The editor edits that text directly and formats it on screen with decorations; it never converts the script into a separate structure that becomes the real copy.

Where Pagework needs something Fountain lacks (stage play conventions, production revision marks), it defines extensions that degrade gracefully in other Fountain apps (as notes, sections or boneyard comments). Each extension gets its own ADR.

## Consequences

- Any script can be exported as a `.fountain` file at any time, losslessly for everything except Pagework-only metadata.
- Snapshots and comparisons are text diffs.
- Some editing features are harder with plain text than with a structured model (for example, guaranteeing a parenthetical never appears outside dialogue). The parser reports such cases; the editor never silently rewrites the writer's text.
- Final Draft import needs a mapping step, and some FDX features have no Fountain equivalent. Losses are reported to the user.

## Alternatives considered

- **A structured document model (ProseMirror or similar) with Fountain as an export format:** stronger editing guarantees, but the writer's real copy would be in a private format, and diffs and merges get harder.
- **Final Draft XML as the internal format:** proprietary, verbose, and screen-only.
