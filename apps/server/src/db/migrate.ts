import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { backup } from "node:sqlite";
import { Migrator, type MigrationResult } from "kysely";
import type { Logger } from "../log.ts";
import type { Store } from "./index.ts";
import { MIGRATIONS } from "./migrations/index.ts";
import type { Migration } from "./migrations/types.ts";

export interface MigrateOptions {
  /** Where SQLite backups go (normally /data/backups). */
  backupDir: string;
  log: Logger;
  now?: () => Date;
  /** Defaults to every released migration; tests pass their own. */
  migrations?: Readonly<Record<string, Migration>>;
}

export interface MigrateOutcome {
  applied: string[];
  /** The backup taken first, if there was anything to back up. */
  backupFile: string | null;
}

function migrator(
  store: Store,
  migrations: Readonly<Record<string, Migration>> = MIGRATIONS,
): Migrator {
  return new Migrator({
    db: store.db,
    provider: { getMigrations: () => Promise.resolve({ ...migrations }) },
    // Kysely's own bookkeeping tables, kept apart from Pagework's.
    migrationTableName: "kysely_migration",
    migrationLockTableName: "kysely_migration_lock",
  });
}

export async function pendingMigrations(
  store: Store,
  migrations: Readonly<Record<string, Migration>> = MIGRATIONS,
): Promise<string[]> {
  const all = await migrator(store, migrations).getMigrations();
  return all.filter((m) => m.executedAt === undefined).map((m) => m.name);
}

function stamp(date: Date): string {
  return date.toISOString().replace(/[:.]/g, "-");
}

/**
 * Runs every pending migration, in order (ARCHITECTURE.md, Upgrades). On
 * SQLite, a copy of the database is written to the backup folder first,
 * unless the database is brand new. If a migration fails, its transaction
 * is rolled back and the error is thrown; the server doesn't start.
 */
export async function migrate(
  store: Store,
  options: MigrateOptions,
): Promise<MigrateOutcome> {
  const migrations = options.migrations ?? MIGRATIONS;
  const pending = await pendingMigrations(store, migrations);
  if (pending.length === 0) return { applied: [], backupFile: null };

  let backupFile: string | null = null;
  const executed = Object.keys(migrations).length - pending.length;
  if (store.sqlite !== null && store.existed && executed > 0) {
    mkdirSync(options.backupDir, { recursive: true });
    const now = options.now?.() ?? new Date();
    backupFile = join(
      options.backupDir,
      `pagework-${stamp(now)}-before-${pending[0] ?? "migration"}.db`,
    );
    options.log.info("Backing up the database before migrating", {
      file: backupFile,
    });
    await backup(store.sqlite, backupFile);
  }

  const { error, results } = await migrator(
    store,
    migrations,
  ).migrateToLatest();
  const applied = (results ?? [])
    .filter((r: MigrationResult) => r.status === "Success")
    .map((r) => r.migrationName);
  for (const name of applied) options.log.info("Migrated", { migration: name });
  if (error !== undefined) {
    const failed = results?.find((r) => r.status === "Error")?.migrationName;
    options.log.error("Migration failed; the database is unchanged", {
      migration: failed,
      error,
      ...(backupFile === null ? {} : { backup: backupFile }),
    });
    throw error instanceof Error
      ? error
      : new Error("A migration failed", { cause: error });
  }
  return { applied, backupFile };
}
