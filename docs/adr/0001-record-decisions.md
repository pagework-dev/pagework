# 0001. Record architecture decisions

- Status: Accepted
- Date: 2026-11-10

## Context

Pagework is a public project with one maintainer, and most of its code is written with an AI model. Both make written reasoning essential: contributors need to know why things are the way they are, and an AI working on the code needs fixed decisions to work against rather than re-deciding them each session.

## Decision

Significant decisions are recorded as short Markdown files in `docs/adr/`, numbered in order. A decision is significant if reversing it later would mean changing many files, migrating data, or changing what users can rely on.

## Consequences

- Changing direction means writing a new record, which forces the reasons to be stated.
- Contributors and AI agents are expected to read the records before proposing changes that touch them (see `CLAUDE.md`).
- Some overhead per decision. Small, easily reversed choices don't get a record.

## Alternatives considered

- **Decisions in issues and pull requests only.** Hard to find later, and scattered.
- **One large design document.** Tends to be edited in place, which loses the history of why a decision changed.
