# Third-party notices

Pagework includes or depends on the following third-party work. Each keeps its own licence. Pagework itself is AGPL-3.0-only (see `LICENSE` and `NOTICE`).

## Bundled with Pagework

### Courier Prime

- Files: `packages/pdf/fonts/CourierPrime-Regular.ttf`, `CourierPrime-Bold.ttf`, `CourierPrime-Italic.ttf`, `CourierPrime-BoldItalic.ttf`
- Copyright 2015 The Courier Prime Project Authors (https://github.com/quoteunquoteapps/CourierPrime)
- Licence: SIL Open Font License 1.1, in full in `packages/pdf/fonts/OFL.txt`
- Source of these copies: the Google Fonts release, as packaged in `@expo-google-fonts/courier-prime` 0.4.1 on npm. The files are unmodified. They are embedded unmodified in exported PDFs, which the OFL permits.

## Runtime dependencies (installed from npm, not copied into this repository)

| Package | Version | Licence | Used by |
|---|---|---|---|
| `pdf-lib` | 1.17.1 | MIT | `packages/pdf` |
| `pako` (via pdf-lib) | 1.0.11 | MIT AND Zlib | `packages/pdf` |
| `tslib` (via pdf-lib) | 1.14.1 | 0BSD | `packages/pdf` |
| `@pdf-lib/standard-fonts` (via pdf-lib) | 1.0.0 | MIT | `packages/pdf` |
| `@pdf-lib/upng` (via pdf-lib) | 1.0.1 | MIT | `packages/pdf` |
| `@pdf-lib/fontkit` | 1.1.1 | MIT | `packages/pdf` |
| `yaml` | 2.9.1 | ISC | `packages/templates` |
| `@cfworker/json-schema` | 4.1.6 | MIT | `packages/templates` |
| `svelte` | 5.57.3 | MIT | `apps/web` |
| `clsx` (via svelte) | 2.1.1 | MIT | `apps/web` |
| `esm-env` (via svelte) | 1.2.2 | MIT | `apps/web` |
| `@codemirror/state` | 6.7.6 | MIT | `apps/web` |
| `@codemirror/view` | 6.43.15 | MIT | `apps/web` |
| `@codemirror/commands` | 6.11.1 | MIT | `apps/web` |
| `@marijn/find-cluster-break` (via @codemirror/state) | 1.0.4 | MIT | `apps/web` |
| `crelt`, `style-mod`, `w3c-keyname` (via @codemirror/view) | 1.0.7, 4.1.4, 2.2.8 | MIT | `apps/web` |
| `hono` | 4.13.17 | MIT | `apps/server` |
| `@hono/node-server` | 2.1.8 | MIT | `apps/server` |
| `kysely` | 0.28.20 | MIT | `apps/server` |
| `@codemirror/language`, `@lezer/common`, `@lezer/highlight`, `@lezer/lr` (via @codemirror/commands) | 6.13.1, 1.5.5, 1.2.5, 1.4.12 | MIT | Installed with `@codemirror/commands`; not in the built app, which uses none of their code |

The browser app (`apps/web`) is built into static files that include the packages above and the Courier Prime files. Templates reach the browser as JSON resolved at build time, so `yaml` and `@cfworker/json-schema` are not in the browser bundle.

The server uses Node's built-in `node:sqlite` for SQLite, so it has no native add-ons.

Development-only tools (TypeScript, ESLint, Prettier and `prettier-plugin-svelte`, Vite and `@sveltejs/vite-plugin-svelte`, Vitest, `svelte-check`, Playwright, `@types/node`) are not shipped and are listed in the `package.json` files.
