# 0011. Continuation markers exist only when rendering

- Status: Accepted
- Date: 2026-11-10

## Context

Scripts use three kinds of continuation marker:

1. A speech split by a page break: `(MORE)` at the foot of the page and `(CONT'D)` after the character cue on the next.
2. A character speaking again after an action line, with no one else speaking in between: `JOHN (CONT'D)`.
3. A scene running onto the next page: `CONTINUED:` at the top of the page and `(CONTINUED)` at the foot, in production scripts.

All three depend on where page breaks fall or on what surrounds a speech. If they are typed into the text, they go stale the moment anything above them changes, they double up on export, and other apps add their own on top.

## Decision

Continuation markers are never stored in the script text. The paginator adds them when rendering (in the editor, PDF, DOCX and print), following the template's settings:

- Kind 1 is controlled by `pagination.dialogue` (`more`, `continued`).
- Kind 2 is controlled by `pagination.character_continued` (on or off, and its text).
- Kind 3 is controlled by `pagination.scene_continued` (off by default).

The editor shows them as rendered decorations the writer cannot place the cursor inside or edit.

On import (Fountain, FDX, PDF, DOCX and script conversion), markers of all three kinds are recognised and removed from the text. Character extensions that are content, such as `(V.O.)`, `(O.S.)` and `(PRE-LAP)`, are kept.

Fountain and FDX exports contain no continuation markers; the receiving app adds its own.

## Consequences

- Markers are always correct for the current text and template, and can be switched on or off per template without touching any script.
- Import needs reliable recognition of the markers in all their common spellings (`CONT'D`, `CONT’D`, `CONTD`, `cont.`, `continued`), covered by tests.
- A writer who wants a marker somewhere the rules wouldn't place it cannot type one in. If that need turns out to be real, it gets a per-cue override, recorded as metadata rather than text.

## Alternatives considered

- **Writer-typed markers (plain Fountain behaviour):** simple, but markers go stale and duplicate.
- **Editor inserts markers into the text automatically (as some apps do):** correct at the moment of insertion, wrong after the next edit above it.
