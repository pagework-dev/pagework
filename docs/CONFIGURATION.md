# Configuration

The server (`apps/server`) is configured with environment variables only. This is the complete list; a test (`apps/server/test/config.test.ts`) fails if the server reads a variable that isn't documented here.

If a setting is missing or wrong, the server doesn't start. It prints every problem at once and exits with status 78.

## Required

| Variable | What it is |
|---|---|
| `PAGEWORK_MODE` | `personal`, `team` or `hosted` ([ADR 0008](adr/0008-deployment-modes.md)). **personal:** one account, created the first time you open the server. **team:** organisations, invitations and roles. **hosted:** team plus public sign-up, quotas and billing hooks, for running Pagework as a service. You can change `personal` to `team` later and keep everything; going back isn't supported. |
| `PAGEWORK_SECRET` | A long random value, at least 32 characters. Make one with `openssl rand -hex 32`. It keys the hashes of sign-in sessions and single-use links, so changing it signs everyone out and cancels outstanding links. Keep it out of version control. It is never logged. |
| `PAGEWORK_URL` | The address people type to reach the server, such as `https://scripts.example.com`, with no path. It is used to check where requests come from (CSRF protection), to decide whether cookies are marked Secure, and in links the server hands out. |

`PAGEWORK_URL` must use `https://`, except for `http://localhost` (and `127.0.0.1`), which browsers treat as secure. To use plain `http://` on another address, see `PAGEWORK_INSECURE_HTTP`.

## Optional

| Variable | Default | What it is |
|---|---|---|
| `DATABASE_URL` | SQLite file `pagework.db` in the data folder | Where the database is. Leave it unset for SQLite ([ADR 0006](adr/0006-database.md)). `sqlite:/path/to/file.db` (or `file:`) chooses another SQLite file; a relative path is inside the data folder. `postgres://user:password@host:5432/database` chooses PostgreSQL (not supported yet in this version). |
| `PAGEWORK_DATA_DIR` | `/data` | The folder for the SQLite database and the backups taken before upgrades (`backups/`). In Docker this is the `/data` volume. |
| `HOST` | `0.0.0.0` | The network address the server listens on. |
| `PORT` | `3000` | The port the server listens on. |
| `PAGEWORK_TRUST_PROXY` | `false` | Set to `true` when the server is behind a reverse proxy (Caddy, nginx, Traefik, Cloudflare Tunnel) that sets `X-Forwarded-For`. Rate limits then count the visitor's address instead of the proxy's. Don't turn it on without a proxy: anyone could then pretend to be any address. |
| `PAGEWORK_INSECURE_HTTP` | `false` | Set to `true` to allow a `PAGEWORK_URL` starting with `http://` on an address other than localhost. Passwords and sessions then cross the network unencrypted, so only do this on a private network you trust. The server logs a warning at start-up. |
| `PAGEWORK_LOG_LEVEL` | `info` | `debug`, `info`, `warn` or `error`. `debug` adds one line per request (method, path, status and time; never query strings, headers or bodies). |
| `PAGEWORK_WEB_DIR` | `apps/web/dist` next to the server | The built web app. The Docker image sets this; you shouldn't need to. |
| `PAGEWORK_VERSION` | `development` | The version reported by `/api/instance`. Set when the Docker image is built. |

## What is never logged

Passwords, session cookies, CSRF tokens, single-use links, `PAGEWORK_SECRET`, request bodies and script text. Requests are logged by path only, because query strings can hold single-use links.

## Upgrades and backups

On start-up the server runs any new database migrations, in order, in a single transaction. On SQLite, if the database already has data, a copy is written to `backups/` in the data folder first, named after the time and the first new migration, for example `backups/pagework-2026-11-21T09-00-00-000Z-before-0002-invites.db`. If a migration fails, the transaction is rolled back, the database is left as it was, and the server doesn't start. Downgrades aren't supported; restore the backup instead.

Backups are kept until you delete them.
