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
| `PAGEWORK_SETUP_CODE` | a new random code at each start | The code needed to create the first account (see First-run setup). Set it when you deploy without reading the logs, for example from a separate deployment repository. At least 12 letters and digits; it is no use once the first account exists. |
| `PAGEWORK_WEB_DIR` | `apps/web/dist` next to the server | The built web app. The Docker image sets this; you shouldn't need to. |
| `PAGEWORK_VERSION` | `development` | The version reported by `/api/instance`. Set when the Docker image is built. |

## First-run setup

Until the first account exists, whoever opens the server first could claim it, and a server reached through a tunnel is on the internet from the moment it starts. So creating the first account needs a **setup code** that only the person running the server can see. At start-up the server prints a line like this in its log (`docker logs pagework`):

```
Pagework isn't set up yet. Open https://scripts.example.com/?setup=K7QX-M2PA-9RTE to create the first account, or type the setup code K7QX-M2PA-9RTE there.
```

Open that address, or open the server and type the code. A new code is made each time the server starts, until setup is done. To choose the code yourself, set `PAGEWORK_SETUP_CODE`.

The first account is the first instance administrator. In `personal` mode it is the only account. In `team` and `hosted` mode, setup also asks for the name of the first organisation.

## Signing in

- Passwords are hashed with argon2id (19 MiB, 2 passes). They must be 10 to 256 characters.
- Sessions are kept on the server. The browser holds a random token in an HttpOnly, SameSite=Lax cookie, marked Secure and named `__Host-pagework_session` when `PAGEWORK_URL` is https. The database stores a keyed hash of the token, never the token. Sessions end after 30 days without use, and after 90 days in any case.
- Every request that changes something must come from a page on `PAGEWORK_URL` (the Origin header is checked) and carry the session's CSRF token.
- After 10 failed sign-ins in a row, an account locks for 15 minutes (an instance admin can unlock it sooner). Each address can try 30 times in 15 minutes; addresses with no account are limited in the same way, so the responses don't reveal which accounts exist. These limits are counted per visitor address: set `PAGEWORK_TRUST_PROXY=true` behind a reverse proxy.

## What is never logged

Passwords, session cookies, CSRF tokens, single-use links, `PAGEWORK_SECRET`, request bodies and script text. Requests are logged by path only, because query strings can hold single-use links.

## Upgrades and backups

On start-up the server runs any new database migrations, in order, in a single transaction. On SQLite, if the database already has data, a copy is written to `backups/` in the data folder first, named after the time and the first new migration, for example `backups/pagework-2026-11-21T09-00-00-000Z-before-0002-invites.db`. If a migration fails, the transaction is rolled back, the database is left as it was, and the server doesn't start. Downgrades aren't supported; restore the backup instead.

Backups are kept until you delete them.
