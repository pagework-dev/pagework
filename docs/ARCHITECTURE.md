# Architecture

Status: draft, written before any code. Where this document and an ADR disagree, the ADR wins and this document gets fixed.

## Overview

Pagework is one server process and one browser app, shipped as one Docker image.

```
 Browser (apps/web)                         Server (apps/server)
 ┌───────────────────────────────┐          ┌────────────────────────────┐
 │ Svelte UI                     │          │ HTTP API (Hono)            │
 │ CodeMirror 6 editor           │  HTTPS   │ Auth, orgs, permissions    │
 │ Yjs document ◄────────────────┼──────────┼► Yjs document store        │
 │ IndexedDB copy (offline, v2)  │ (WS, v2) │ PDF / FDX export           │
 │                               │          │ SQLite or PostgreSQL       │
 │  uses: fountain, layout       │          │  uses: fountain, layout,   │
 └───────────────────────────────┘          │        pdf, fdx            │
                                            └────────────────────────────┘
```

The browser and the server run the same parser and the same pagination engine. That is the central design constraint: the page count in the editor and the page count in the exported PDF come from one piece of code ([ADR 0003](adr/0003-typescript-end-to-end.md)).

## Repository layout

A pnpm workspace.

| Path | Contents |
|---|---|
| `packages/fountain` | Fountain parser. Text in, typed element list out. Incremental: re-parses only the changed region. No DOM, no Node APIs. |
| `packages/layout` | Pagination engine. Element list plus a template in, page model (lines with positions, page breaks, (MORE)/(CONT'D), scene numbers) out. Pure functions. |
| `packages/templates` | Template schema, loader, `extends` resolution and validation. |
| `templates/` | The built-in templates as YAML files. Top level on purpose, so they are easy to find and edit. |
| `packages/pdf` | Renders a page model to PDF with pdf-lib and an embedded Courier Prime. Runs in Node and in the browser. |
| `packages/fdx` | Final Draft `.fdx` import and export. |
| `apps/server` | HTTP API, auth, database, document storage, export endpoints, static file serving for the web app. |
| `apps/web` | The browser app: Svelte 5 and CodeMirror 6. |
| `fixtures/` | Reference scripts and expected output (element lists, page models, PDFs) used by tests. |
| `docs/` | This documentation. |

Dependency direction is strictly one way: `fountain` ← `layout` ← `pdf`, and both apps depend on the packages, never the reverse. Packages never import from apps.

## The document

### Source of truth

A script's text is Fountain ([ADR 0004](adr/0004-fountain-as-source.md)). The editor edits Fountain text directly; formatting is applied on screen by decorating the text, not by converting it into a different structure.

Pagework adds a small number of extensions for stage plays and production features. Every extension is written so that other Fountain apps degrade gracefully: they see a note, a section or a boneyard comment, never broken formatting. Extensions are listed in `docs/TEMPLATES.md` and versioned with the template schema.

### Editing behaviour

Fountain is the storage format, not the interface. Writers see and edit a formatted script page and work the way they do in Final Draft; they never need to know Fountain syntax. This is a requirement, not a nice-to-have.

**Element-first editing.** Every line has an element type (scene heading, action, character, parenthetical, dialogue, transition, and the stage equivalents). The writer chooses the type with the keyboard, the toolbar or the touch element bar; the editor writes whatever Fountain is needed to make the text parse as that type.

**The editor owns the markers.** Fountain decides some types by inference (a line in capitals followed by text is a character) and others by marker characters (`.` forces a scene heading, `@` a character, `!` action, `>` a transition). The editor:

- adds a forcing marker whenever inference alone would give the wrong type, and removes it when it's no longer needed;
- hides markers in the formatted view, so the writer sees `INT. KITCHEN - NIGHT`, not `.int. kitchen - night`;
- shows case as the template displays it (character cues and scene headings in capitals) while keeping what the writer typed;
- re-checks the surrounding lines after every edit, so typing in one line can never silently change the type of the line after it.

The rule the tests enforce: **the element type the writer chose is the type the parser reads back**, for every element, after any edit, paste, undo or import.

**Keyboard flow.** Enter and Tab move between elements in the standard screenwriting sequence; the exact mapping is in `docs/DESIGN.md`. Autocomplete offers character names, scene heading prefixes (INT., EXT.), locations, times of day and transitions already used in the script.

**Paste.** Text pasted from Fountain files, Final Draft, PDFs or plain email keeps its element types where they can be recognised. Anything ambiguous becomes action, never a guessed type that changes later lines.

**Continuation markers are never in the text** ([ADR 0011](adr/0011-continuation-markers-render-only.md)). `(MORE)`, `(CONT'D)` and `CONTINUED:` are added by the paginator when rendering, according to the template, and shown in the editor as decorations that can't be edited. Paste and import strip them; extensions that are content, such as `(V.O.)` and `(O.S.)`, are kept.

**Source view.** A "Show Fountain" toggle displays the raw text with light syntax colouring, for writers who prefer it. Both views edit the same document.

### Storage

Each script is stored as a Yjs document from the first version ([ADR 0005](adr/0005-yjs-from-day-one.md)), with a plain Fountain copy saved alongside it on every save.

- The Yjs state is what the editor loads and syncs. It makes offline editing and real-time co-writing additions rather than rewrites.
- The plain Fountain copy is what search, export, snapshots and backups use. A user can always get their script out as a `.fountain` file, even if Yjs state were lost.

### Snapshots

A snapshot is a named, immutable copy of the Fountain text at a point in time, with the user who took it. Comparing snapshots is a text diff mapped onto scenes. Automatic snapshots are taken before imports, restores and large deletions.

## Data model

All tables that hold user content carry `org_id`, from the first migration ([ADR 0008](adr/0008-deployment-modes.md)). Every query that reads user content filters by the caller's organisation in one shared query helper, and tests check that no route can read across organisations.

| Table | Purpose |
|---|---|
| `users` | Account: email, display name, password hash (argon2id), status (active, disabled, invited, locked), instance role (admin, user), must-change-password flag, two-factor secret (encrypted), last sign-in, created date |
| `sessions` | Server-side sessions; the cookie holds only a random ID. Revocable per user. |
| `password_resets` | Single-use reset tokens (stored hashed), with expiry and who issued them |
| `groups`, `group_members` | Version 2: named groups of users within an organisation, granted access to projects together |
| `orgs` | Organisation. Personal mode creates exactly one. |
| `memberships` | `user_id`, `org_id`, `role` (owner, admin, writer, commenter, reader) |
| `invites` | Pending invitations with expiry |
| `projects` | A container for related scripts (a feature, a series, a season) |
| `scripts` | Title, template ID, page size, owner, project, timestamps |
| `script_state` | Current Yjs state (binary) and current Fountain text |
| `script_snapshots` | Named Fountain copies |
| `comments` | Anchored to a text range by Yjs relative positions, threaded |
| `audit_log` | Who did what, to which script or account, and when. Includes every admin action. |

Permissions are checked on the server for every request. The browser hides controls a user cannot use, but never enforces anything.

## Deployment modes

One codebase, one image, chosen by configuration ([ADR 0008](adr/0008-deployment-modes.md)).

| Mode | Who it's for | Differences |
|---|---|---|
| `personal` | One writer on their own server | One account, created at first run. One organisation. No sign-up, no invites. Login is still required. |
| `team` | A writing room, company or theatre group | Organisations, invitations, roles, audit log. Sign-up off by default; admins invite. |
| `hosted` | The paid service run by Thorngate | `team` plus public sign-up, quotas and billing. Billing sits behind an interface; the self-hosted modes never load it. |

Changing from `personal` to `team` is supported and keeps all data. Going back is not.

## User administration

Team mode includes an administration console following the conventions of directory tools such as Active Directory: a table of accounts, a detail pane per account, status as words, and bulk actions. It borrows the conventions, not the look ([ADR 0012](adr/0012-instance-and-org-admins.md)).

### Two levels of admin

| | Instance admin | Organisation admin |
|---|---|---|
| Exists in | `team` mode (self-hosted). In `hosted` mode, only the operator. | `team` and `hosted` |
| Manages | Every account on the server | Membership of their organisation |
| Can | Create, disable, enable and delete accounts; send password resets; force sign-out; require a password change; unlock; reset two-factor; promote other instance admins | Invite and remove members; change members' roles; transfer scripts between members |
| Cannot | See or choose anyone's password | Change anything about an account itself (its password, status or two-factor), because the account may belong to other organisations |

The first account created on a new server is the first instance admin. The server always keeps at least one active instance admin; the last one can't be disabled or demoted.

### Account statuses

- **Active:** can sign in.
- **Invited:** has been sent an invitation and has not yet set a password.
- **Locked:** too many failed sign-ins. Unlocks automatically after a delay, or straight away by an admin.
- **Disabled:** can't sign in. All sessions end immediately. Scripts, comments and history are kept.

Deleting an account requires its scripts to be transferred to another member first, so no one's work disappears with an account.

### Password resets

Admins never see or set passwords.

- **With SMTP configured:** "Send password reset" emails the user a single-use link.
- **Without SMTP, or in person:** "Create reset link" gives the admin a single-use link to hand over. It expires after 24 hours, and the user sets their own password when they use it.
- Users can request their own reset from the sign-in page when SMTP is configured.
- Reset tokens are stored hashed, used once, and invalidate all of the account's existing sessions when used.

### The console

- **Users table:** name, email, status, instance role, organisations, last sign-in. Search, filter by status and organisation, sort by any column. Bulk actions: disable, enable, resend invitation, send password reset.
- **Detail pane:** account details, membership list, recent activity from the audit log, and the actions above.
- Every admin action is written to the audit log with who did it and when.

## Requests and sync

**Version 1:** the editor saves Yjs updates to the server over HTTP, batched (about one request per second while typing, plus on blur and page hide). The server merges the updates, writes the new state, regenerates the Fountain copy, and returns.

**Version 2:** a WebSocket sync channel (Yjs protocol) for real-time co-writing, presence and live comments, plus an IndexedDB copy of open scripts so writing continues offline and merges when the connection returns. Because the stored format is already Yjs, neither needs a data migration.

## Export and import

- **PDF:** produced by `packages/pdf` from the same page model the editor shows. Server-side by default; in the browser when offline.
- **Fountain:** the plain text copy, with Pagework extensions kept.
- **Final Draft (.fdx):** import maps FDX paragraph types to Fountain elements; export does the reverse. Anything that can't round-trip is reported to the user, never silently dropped.
- **Word (.docx):** export only in version 1, built from the page model with styles per element type, so the document stays editable in Word. Word lays out pages itself, so page breaks can differ slightly from the PDF; the export dialog says so. (`.docx` import arrives with script conversion.)
- **Print:** generates the PDF and opens the browser's print dialog on it, so printed pages always match exported pages. The editor view itself is never printed.
- **Export everything:** one archive containing every script the user can access, as Fountain and PDF, plus a manifest. Available to every user, in every mode.
- **Not supported:** Fade In's `.fadein` format. Fade In imports FDX and Fountain, which covers moving scripts to and from it.
- Import never overwrites. It creates a new script, or a new snapshot of an existing one.
- Import and export never contain continuation markers ([ADR 0011](adr/0011-continuation-markers-render-only.md)).

## Sharing (version 2)

View-only links for sending a script to readers outside the organisation, such as competitions, producers or a cast.

- A link is issued to a named recipient, can expire, can be revoked, and records when it was opened.
- The reader sees rendered pages with no download, print or export controls. Optionally, pages are served as images so the text can't be selected; this is off by default because it makes the script unreadable to screen readers.
- Every page carries a visible watermark with the recipient's name, plus an invisible per-link mark, so a leaked copy can be traced.
- Share pages send `noindex` and AI-training opt-out headers (`noai`, TDM reservation). These only deter crawlers that respect them.
- What this cannot do, and the interface says so plainly: stop someone photographing or screenshotting the screen. Watermarking is the real protection; it makes leaks traceable, not impossible.

## Privacy

- **No telemetry.** Pagework does not collect usage statistics, crash reports or analytics, and makes no network requests other than to the server it is served from and any SMTP server the admin configures. Diagnostic counts (such as unresolved lines in script conversion) are stored locally and never sent anywhere.
- Fonts and all front-end assets are self-hosted in the image; nothing loads from a CDN.

## Interface text and spelling

- **All interface text lives in translation files** from the first screen, with English (Australian) as the source. Components never contain literal user-facing strings. Shipping other languages is later work; making it possible is not.
- **Spellcheck** uses the browser's built-in checker in the writer's chosen language. Each script has its own dictionary, which automatically includes the script's character names and locations so they aren't flagged.

## Upgrades

- Database migrations run automatically on start-up, in order, inside a transaction where the database allows it.
- Before running migrations, the server writes a backup of the SQLite file (or refuses to start on PostgreSQL until the admin confirms a backup, via an environment variable).
- Each release's notes list its migrations and any manual steps. Downgrades are not supported; restore the backup instead.

## Authentication

- Email and password, argon2id hashing, server-side sessions in an HttpOnly, Secure, SameSite=Lax cookie.
- Rate limiting on sign-in and password reset; accounts lock after repeated failed sign-ins.
- Two-factor authentication with an authenticator app (TOTP) and single-use recovery codes, in 1.0. Instance admins can require it for everyone.
- Version 2: OpenID Connect sign-in, for self-hosters using Authentik, Keycloak and similar.
- Email (invitations, password resets) via SMTP settings. Without SMTP, admins get copyable single-use links instead (see User administration).

## Configuration

Environment variables only, documented in one place (`docs/CONFIGURATION.md`, written with the server). Required: `PAGEWORK_MODE`, `PAGEWORK_SECRET`, `PAGEWORK_URL`. Database defaults to SQLite in the `/data` volume; set `DATABASE_URL` to use PostgreSQL ([ADR 0006](adr/0006-database.md)).

## Performance budgets

Measured in CI with Chromium's CPU throttled 4×, as a stand-in for the reference device (a low-end Chromebook with 4 GB of RAM). A change that breaks a budget fails the build.

| Measure | Budget |
|---|---|
| Open a 120-page script and show the first page | under 1 s |
| Keystroke to screen update, 120-page script | under 16 ms (one frame) |
| Full re-pagination of a 120-page script | under 150 ms, off the keystroke path |
| JavaScript for the editor screen, compressed | under 150 KB |
| Server memory at idle, personal mode | under 100 MB |

On the keystroke path: parse the changed lines, update decorations. Pagination runs after typing pauses, or in a worker.

## Testing

- **Parser:** golden files. Each fixture is a `.fountain` file with the expected element list next to it, including every example from the Fountain specification.
- **Layout:** fixtures with expected page breaks and line positions. Reference scripts are checked against known page counts.
- **PDF:** rendered pages compared to reference images, with a small tolerance.
- **Templates:** every template renders the standard sample script; the output is snapshot-tested so a template change can't silently move a page break.
- **Server:** API tests against both SQLite and PostgreSQL, including cross-organisation access tests.
- **Web:** Playwright tests on Chromium and WebKit (for iPad Safari), at 375 px, 768 px and 1280 px wide.

## Browser support

The last two versions of Chrome, Edge, Firefox and Safari, including iPadOS Safari. ChromeOS on low-end hardware is the performance reference.
