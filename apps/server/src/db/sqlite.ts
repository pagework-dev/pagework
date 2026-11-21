import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { SqliteAdapter, SqliteDialect, type SqliteDatabase } from "kysely";

/**
 * SQLite through Node's built-in `node:sqlite`, adapted to the interface
 * Kysely's SQLite dialect expects. Using the built-in module means the
 * image has no native add-on to compile for each CPU architecture.
 */

function bind(value: unknown): SQLInputValue {
  if (typeof value === "boolean") return value ? 1 : 0;
  if (value instanceof Date) return value.toISOString();
  if (value === undefined) return null;
  return value as SQLInputValue;
}

export function adapt(db: DatabaseSync): SqliteDatabase {
  return {
    close() {
      if (db.isOpen) db.close();
    },
    prepare(sql) {
      const statement = db.prepare(sql);
      const reader = statement.columns().length > 0;
      const params = (values: readonly unknown[]): SQLInputValue[] =>
        values.map(bind);
      return {
        reader,
        all: (values) => statement.all(...params(values)),
        run: (values) => statement.run(...params(values)),
        iterate: (values) => statement.iterate(...params(values)),
      };
    },
  };
}

/**
 * Opens (creating if needed) the database file in WAL mode (ADR 0006), with
 * foreign keys enforced. ":memory:" gives a private in-memory database.
 */
export function openSqlite(file: string): DatabaseSync {
  if (file !== ":memory:") mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA busy_timeout = 5000");
  if (file !== ":memory:") {
    db.exec("PRAGMA journal_mode = WAL");
    // Safe with WAL: a power cut can lose the last commits, never corrupt.
    db.exec("PRAGMA synchronous = NORMAL");
  }
  return db;
}

/**
 * SQLite can roll back schema changes, but Kysely's adapter says it can't,
 * which would run migrations outside a transaction. With this, a failed
 * upgrade leaves the database exactly as it was.
 */
class TransactionalSqliteAdapter extends SqliteAdapter {
  override get supportsTransactionalDdl(): boolean {
    return true;
  }
}

class PageworkSqliteDialect extends SqliteDialect {
  override createAdapter(): SqliteAdapter {
    return new TransactionalSqliteAdapter();
  }
}

export function sqliteDialect(db: DatabaseSync): SqliteDialect {
  return new PageworkSqliteDialect({ database: adapt(db) });
}
