# 0007. Script formats are data files with inheritance

- Status: Accepted
- Date: 2026-11-10

## Context

Pagework supports screenplays and stage plays, in US Letter and A4, plus house formats used by individual companies. Formats differ in a handful of measurements and rules. Hard-coding each one would mean code changes for every new format; custom formats in the app are planned for version 2.

## Decision

Each format is a YAML template file in `templates/`, validated by a JSON Schema. Templates can `extend` another template and override only what differs. The pagination engine reads templates; it contains no format-specific values.

Lengths always carry units (`mm`, `in`, `pt`). The specification is in `docs/TEMPLATES.md`.

## Consequences

- New formats need no code changes, and can be contributed by people who don't write TypeScript.
- Every template is snapshot-tested against a standard sample script, so changes to shared rules show up across all formats in review.
- The engine must be general enough for formats not yet seen. Where a format needs genuinely new behaviour, the schema gets a new versioned field rather than a special case.
- In-app template editing (version 2) builds on the same files and schema.

## Alternatives considered

- **Formats in code:** simpler at first, but every format becomes a code change and a release.
- **CSS-based formats:** familiar, but CSS can't express pagination rules such as (MORE)/(CONT'D) or keep-together, and the PDF renderer doesn't use CSS.
- **JSON templates:** fine for machines, worse for people editing by hand. YAML is converted to the same structure.
