# 0006. SQLite by default, PostgreSQL optional, Kysely

- Status: Accepted
- Date: 2026-11-10

## Context

Most self-hosters run Pagework for one person or a small group, and want a single container with one volume. Larger teams and the hosted service need a proper database server with concurrent writers and managed backups.

## Decision

- **SQLite** (in WAL mode, file in the `/data` volume) is the default.
- **PostgreSQL** is supported by setting `DATABASE_URL`.
- Queries are written with **Kysely**, a typed query builder that generates SQL for both. No ORM.
- Migrations are plain, numbered TypeScript files, tested against both databases in CI.

## Consequences

- Zero-configuration install for most users; backup is copying one file (or using the built-in backup command).
- Every query and migration must work on both databases, which rules out some database-specific features. CI enforces it.
- Kysely keeps queries close to SQL, which suits a maintainer used to writing raw SQL.

## Alternatives considered

- **PostgreSQL only:** a second container for every install, for no benefit to single users.
- **SQLite only:** limits team use and the hosted service.
- **An ORM (Prisma, Drizzle, TypeORM):** more abstraction and generated code than needed, and (for Prisma) a heavy engine in the image.
