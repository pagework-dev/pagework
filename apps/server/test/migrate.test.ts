/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-non-null-assertion -- test migrations see an untyped database */
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { Kysely } from "kysely";
import { afterEach, describe, expect, it } from "vitest";
import { openStore } from "../src/db/index.ts";
import { migrate, pendingMigrations } from "../src/db/migrate.ts";
import { MIGRATIONS } from "../src/db/migrations/index.ts";
import { CONTENT_TABLES } from "../src/db/schema.ts";
import { memoryLogger } from "../src/log.ts";
import { tempDir } from "./helpers.ts";

const dirs: ReturnType<typeof tempDir>[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) d.remove();
});

function setup() {
  const dir = tempDir();
  dirs.push(dir);
  return {
    file: join(dir.path, "pagework.db"),
    backups: join(dir.path, "backups"),
  };
}

describe("migrations", () => {
  it("are numbered in order", () => {
    const names = Object.keys(MIGRATIONS);
    expect(names).toEqual([...names].sort());
    names.forEach((name, i) => {
      expect(name).toMatch(new RegExp(`^${String(i + 1).padStart(4, "0")}-`));
    });
  });

  it("create every table on a new database, with no backup", async () => {
    const { file, backups } = setup();
    const store = openStore({ kind: "sqlite", file });
    const outcome = await migrate(store, {
      backupDir: backups,
      log: memoryLogger(),
    });
    expect(outcome.applied).toEqual(Object.keys(MIGRATIONS));
    expect(outcome.backupFile).toBeNull();
    expect(await pendingMigrations(store)).toEqual([]);
    await store.close();
  });

  it("give every content table an org_id", async () => {
    const { file, backups } = setup();
    const store = openStore({ kind: "sqlite", file });
    await migrate(store, { backupDir: backups, log: memoryLogger() });
    await store.close();
    const raw = new DatabaseSync(file);
    for (const table of CONTENT_TABLES) {
      const columns = raw
        .prepare(`PRAGMA table_info(${table})`)
        .all()
        .map((c) => c.name);
      expect(columns, table).toContain("org_id");
    }
    raw.close();
  });

  it("use WAL mode", async () => {
    const { file, backups } = setup();
    const store = openStore({ kind: "sqlite", file });
    await migrate(store, { backupDir: backups, log: memoryLogger() });
    const mode = store.sqlite?.prepare("PRAGMA journal_mode").get();
    expect(mode).toEqual({ journal_mode: "wal" });
    await store.close();
  });

  it("back up an existing database before running new migrations", async () => {
    const { file, backups } = setup();
    const released = { "0001-initial": MIGRATIONS["0001-initial"]! };
    const first = openStore({ kind: "sqlite", file });
    await migrate(first, {
      backupDir: backups,
      log: memoryLogger(),
      migrations: released,
    });
    await first.db
      .insertInto("orgs")
      .values({ id: "o1", name: "Kept", created_at: "2026-01-01T00:00:00Z" })
      .execute();
    await first.close();

    // The next release adds a migration.
    const upgraded = {
      ...released,
      "0002-test": {
        async up(db: Kysely<any>) {
          await db.schema
            .alterTable("orgs")
            .addColumn("extra", "text")
            .execute();
        },
      },
    };
    const later = openStore({ kind: "sqlite", file });
    const outcome = await migrate(later, {
      backupDir: backups,
      log: memoryLogger(),
      migrations: upgraded,
      now: () => new Date("2026-11-21T09:00:00.000Z"),
    });
    await later.close();
    expect(outcome.applied).toEqual(["0002-test"]);
    expect(outcome.backupFile).toBe(
      join(backups, "pagework-2026-11-21T09-00-00-000Z-before-0002-test.db"),
    );
    // The backup is the database as it was: data kept, no new column.
    const copy = new DatabaseSync(outcome.backupFile!);
    expect(copy.prepare("SELECT name FROM orgs").all()).toEqual([
      { name: "Kept" },
    ]);
    expect(
      copy
        .prepare("PRAGMA table_info(orgs)")
        .all()
        .map((c) => c.name),
    ).not.toContain("extra");
    copy.close();
  });

  it("leave the database as it was when a migration fails", async () => {
    const { file, backups } = setup();
    const first = openStore({ kind: "sqlite", file });
    await migrate(first, { backupDir: backups, log: memoryLogger() });
    await first.close();
    const broken = {
      ...MIGRATIONS,
      "9998-adds": {
        async up(db: Kysely<any>) {
          await db.schema
            .createTable("half_done")
            .addColumn("id", "text")
            .execute();
        },
      },
      "9999-fails": {
        up() {
          return Promise.reject(new Error("broken migration"));
        },
      },
    };
    const later = openStore({ kind: "sqlite", file });
    const log = memoryLogger();
    await expect(
      migrate(later, { backupDir: backups, log, migrations: broken }),
    ).rejects.toThrow("broken migration");
    expect(await pendingMigrations(later, broken)).toEqual([
      "9998-adds",
      "9999-fails",
    ]);
    const tables = later.sqlite
      ?.prepare("SELECT name FROM sqlite_master WHERE name = 'half_done'")
      .all();
    expect(tables).toEqual([]);
    expect(log.lines.some((l) => l.level === "error")).toBe(true);
    await later.close();
  });

  it("refuse PostgreSQL in this version with a plain explanation", () => {
    expect(() => openStore({ kind: "postgres", url: "postgres://db" })).toThrow(
      /doesn't support yet/,
    );
  });
});
