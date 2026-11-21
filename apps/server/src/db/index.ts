import { existsSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { Kysely } from "kysely";
import type { DatabaseConfig } from "../config.ts";
import type { Database } from "./schema.ts";
import { openSqlite, sqliteDialect } from "./sqlite.ts";

export interface Store {
  db: Kysely<Database>;
  kind: DatabaseConfig["kind"];
  /** The SQLite connection, for backups; null on PostgreSQL. */
  sqlite: DatabaseSync | null;
  /** True when the database file was there before the server opened it. */
  existed: boolean;
  close(): Promise<void>;
}

export function openStore(config: DatabaseConfig): Store {
  if (config.kind === "postgres")
    throw new Error(
      "DATABASE_URL points to PostgreSQL, which this version of Pagework doesn't support yet. Remove DATABASE_URL to use SQLite in the data folder.",
    );
  const existed = config.file !== ":memory:" && existsSync(config.file);
  const sqlite = openSqlite(config.file);
  const db = new Kysely<Database>({ dialect: sqliteDialect(sqlite) });
  return {
    db,
    kind: "sqlite",
    sqlite,
    existed,
    async close() {
      await db.destroy();
    },
  };
}
