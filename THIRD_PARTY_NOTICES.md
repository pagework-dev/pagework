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
| `yaml` | 2.9.1 | ISC | `packages/templates` |
| `@cfworker/json-schema` | 4.1.6 | MIT | `packages/templates` |

Development-only tools (TypeScript, ESLint, Prettier, Vite, Vitest, `@types/node`) are not shipped and are listed in the `package.json` files.
