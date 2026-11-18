# Pagework

Free, open-source software for writing screenplays and stage plays, that you can run on your own server.

> **Status: planning.** There is nothing to install yet. This repository currently holds the design and architecture documents that the code will be built against. See [ROADMAP.md](ROADMAP.md) for what comes first.

## What it is

Pagework is a script editor that runs in the browser and is served from a single container you host yourself, on a home server, a VPS or a laptop.

- **Screen and stage.** Screenplays and stage plays are both first-class formats, defined by editable templates rather than hard-coded layouts.
- **Plain text underneath.** Scripts are written in [Fountain](https://fountain.io), so your work is always readable in any text editor and portable to other screenwriting apps.
- **Accurate pages.** The page count you see while writing is the page count in the exported PDF, because the editor and the exporter share one pagination engine.
- **One person or a whole company.** Personal mode has a single account and no admin overhead. Team mode adds organisations, invitations and roles.
- **Works on modest hardware.** The editor is built and tested against a low-end Chromebook, and works on tablets and phones.
- **No generative AI.** Pagework never writes, rewrites or critiques your work, and your script stays on the server you chose. See [ADR 0010](docs/adr/0010-no-ai-features.md) for the exact promise.
- **No telemetry.** No analytics, crash reporting or usage tracking. The app talks only to your own server.
- **Your work stays yours.** Export every script you have as Fountain and PDF in one archive, at any time.

## Planned for version 1

- A formatted script editor that works like Final Draft: Enter and Tab move between elements, with autocomplete for characters and scene headings, and a scene navigator. No Fountain syntax to learn.
- Index cards and outline view
- PDF export with correct page breaks, (MORE) and (CONT'D), dual dialogue, title pages and scene numbers
- Import and export of Fountain and Final Draft (`.fdx`); export to Word (`.docx`); printing
- Find and replace, and renaming a character across a script
- Theatre output: character lists, line-numbered rehearsal scripts, lines per character
- Snapshots with side-by-side comparison
- Comments and notes
- Reports: scene list, characters by scene, dialogue counts
- Personal and team modes, with a user administration console for team servers and optional two-factor sign-in
- Docker image; SQLite by default, PostgreSQL optional

Production revisions (coloured pages, locked pages, A-pages), real-time co-writing, view-only sharing with watermarks and custom templates in the app are planned for version 2. The full list is in [ROADMAP.md](ROADMAP.md).

## How this is built

Pagework is directed, reviewed and maintained by Connor McMahon. Most of the code and documentation is written with Claude, an AI model made by Anthropic, working from the decisions recorded in [`docs/adr/`](docs/adr/).

Being upfront about that is deliberate. It also sets the bar: every change is reviewed by a person, every decision has a written reason, and the parts that matter most (parsing, pagination, PDF output, permissions) are covered by tests against fixed reference files rather than trusted on sight.

## Documentation

| Document | Covers |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | How the pieces fit: packages, data model, sync, deployment modes |
| [docs/DESIGN.md](docs/DESIGN.md) | Interface design decisions and the reasons behind them |
| [docs/TEMPLATES.md](docs/TEMPLATES.md) | The script template format, and how to write a new template |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | How the web app is deployed to app.pagework.dev |
| [docs/adr/](docs/adr/) | Architecture decision records |
| [ROADMAP.md](ROADMAP.md) | What is planned, in order |
| [CONTRIBUTING.md](CONTRIBUTING.md) | How to contribute, including the sign-off requirement |
| [SECURITY.md](SECURITY.md) | How to report a vulnerability |

## Licence

Pagework is licensed under the [GNU Affero General Public License v3.0 only](LICENSE). If you run a modified version for other people over a network, you must offer them its source code. See [NOTICE](NOTICE) for the attribution term and [ADR 0002](docs/adr/0002-licence.md) for the reasoning.

"Pagework" is the name of this project. The licence does not grant permission to use the name for a modified version.
