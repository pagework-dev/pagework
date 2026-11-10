# Roadmap

Ordered by dependency, not by date. Each milestone is usable on its own before the next starts.

## 0.1: Parser and pages

The foundation, with no interface yet.

- Fountain parser with golden-file tests covering the full Fountain specification
- Template schema, loader and the built-in screenplay templates (US Letter, A4)
- Pagination engine: page breaks, (MORE)/(CONT'D), character continued, dual dialogue, scene numbers, title page. Continuation markers produced only at render time (ADR 0011)
- PDF output with embedded Courier Prime
- A command-line tool: `pagework export script.fountain --template screenplay-a4 -o script.pdf`
- Page counts checked against reference scripts

## 0.2: The editor

- Formatted script editor with Final Draft-style keyboard flow and autocomplete
- Scene navigator, page view and reflow view
- Element bar for touch devices
- All interface text in translation files from the start
- Spellcheck with per-script dictionaries for character names and locations
- Works with local files only; no server yet

## 0.3: The server, personal mode

- Single Docker image, SQLite, one account created at first run
- Scripts, projects, snapshots and comparison
- Fountain and PDF export, Fountain import, print
- "Export everything" archive
- Automatic migrations with a backup taken first
- Performance budgets enforced in CI

## 0.4: Team mode

- Organisations, invitations, roles, audit log
- User administration console: account statuses, disable and enable, password reset links (by email or handed over), force sign-out, unlock, transfer scripts before deleting
- SMTP settings for invitations and password resets
- Comments and notes
- PostgreSQL support
- Final Draft (`.fdx`) import and export

## 1.0

- Stage play templates, including stage directions inside speeches
- Index cards and outline view
- Find and replace; rename a character across a script
- Word (`.docx`) export
- Reports: scene list, characters by scene, dialogue counts, lines per character
- Theatre output: character list (dramatis personae) page, line-numbered rehearsal scripts
- Two-factor authentication (authenticator app, recovery codes), optionally required by admins
- Installable web app
- Documentation for self-hosters: install, upgrade, backup, restore

## Version 2

- Production revisions: revision colours, locked pages, A-pages, omitted scenes, locked scene numbers
- Real-time co-writing and presence
- Offline editing with automatic merge
- View-only sharing: named, expiring, revocable links with per-reader watermarks and access logs
- Custom templates managed in the app
- Groups of users ("Writers' room", "2027 cast") given access to projects together
- OpenID Connect sign-in

## Version 3 (stretch)

**Script conversion:** upload a badly formatted script and get a properly formatted Pagework script back.

- The main target is scripts written outside screenwriting software: Word documents, Google Docs exports, plain text, and scripts laid out by hand with spaces, tabs and inconsistent capitals. Clean PDFs from screenwriting apps are the easy case and may arrive earlier.
- Rule-based, not AI (ADR 0010). Each line is scored on several signals (capitals, a colon after a name, brackets, italics, indentation, INT./EXT. or "Scene"/"Act" headings, names that recur) and given the most likely element type.
- Detects stage directions embedded inside speeches, using italics and brackets kept from `.docx` and PDF imports. Stage templates keep them inline; screenplay templates split them into dialogue, action and (CONT'D).
- Removes typed continuation markers (ADR 0011).
- A review step before anything is saved: the writer sees each line with its detected type, uncertain spans are highlighted, and the writer fixes mistakes, including bulk fixes ("every line starting with `NAME:` is a character cue followed by dialogue"). Conversion never saves without that check.
- The step that resolves uncertain spans is a replaceable component, and conversion records (locally, counts only) how often spans stay unresolved. If that turns out to be common, an optional AI fallback can be proposed under the conditions in ADR 0010.
- Tested against a corpus of real badly formatted scripts.
- Draws on the rules from the existing 3triple2 script formatter for stage plays.

## Later, not committed

- Hosted service (Pagework by Thorngate)
- Plugin API
- Script breakdown and tagging (props, cast, locations)
- Further import formats
- Interface translations beyond English

## Not planned

- Fade In (`.fadein`) import or export: Fade In reads FDX and Fountain, which covers moving scripts between the two.
