import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { CONTENT_TABLES } from "../src/db/schema.ts";
import { scoped } from "../src/scope.ts";
import { testServer } from "./helpers.ts";

const SRC = fileURLToPath(new URL("../src/", import.meta.url));
const T = "2026-11-21T09:00:00.000Z";

let close: (() => Promise<void>) | null = null;
afterEach(async () => {
  await close?.();
  close = null;
});

async function twoOrgs() {
  const server = await testServer();
  close = server.close;
  const { db } = server.store;
  await db
    .insertInto("orgs")
    .values([
      { id: "a", name: "A", created_at: T },
      { id: "b", name: "B", created_at: T },
    ])
    .execute();
  await db
    .insertInto("users")
    .values({
      id: "u",
      email: "u@example.com",
      display_name: "U",
      password_hash: null,
      status: "active",
      instance_role: "admin",
      must_change_password: 0,
      failed_sign_ins: 0,
      locked_until: null,
      totp_secret: null,
      last_sign_in_at: null,
      created_at: T,
      updated_at: T,
    })
    .execute();
  const row = (id: string, title: string) => ({
    id,
    project_id: null,
    title,
    template_id: "screenplay-a4",
    owner_id: "u",
    created_at: T,
    updated_at: T,
  });
  await scoped(db, "a").insertInto("scripts", row("s-a", "In A")).execute();
  await scoped(db, "b").insertInto("scripts", row("s-b", "In B")).execute();
  return db;
}

describe("organisation scope", () => {
  it("reads only its own organisation's rows", async () => {
    const db = await twoOrgs();
    const titles = await scoped(db, "a")
      .selectFrom("scripts")
      .select("title")
      .execute();
    expect(titles).toEqual([{ title: "In A" }]);
    const other = await scoped(db, "a")
      .selectFrom("scripts")
      .select("title")
      .where("id", "=", "s-b")
      .executeTakeFirst();
    expect(other).toBeUndefined();
  });

  it("sets org_id on insert from the scope", async () => {
    const db = await twoOrgs();
    const row = await db
      .selectFrom("scripts")
      .select("org_id")
      .where("id", "=", "s-b")
      .executeTakeFirstOrThrow();
    expect(row.org_id).toBe("b");
  });

  it("can't insert into another organisation by passing org_id", async () => {
    const db = await twoOrgs();
    await scoped(db, "a")
      .insertInto("projects", {
        id: "p",
        name: "Sneaky",
        created_by: null,
        created_at: T,
        updated_at: T,
        // A caller that forgets the rules: the scope's org wins.
        ...({ org_id: "b" } as object),
      })
      .execute();
    const row = await db
      .selectFrom("projects")
      .select("org_id")
      .executeTakeFirstOrThrow();
    expect(row.org_id).toBe("a");
  });

  it("changes and deletes only its own organisation's rows", async () => {
    const db = await twoOrgs();
    const updated = await scoped(db, "a")
      .updateTable("scripts")
      .set({ title: "Changed" })
      .where("id", "=", "s-b")
      .executeTakeFirst();
    expect(updated.numUpdatedRows).toBe(0n);
    const deleted = await scoped(db, "a")
      .deleteFrom("scripts")
      .executeTakeFirst();
    expect(deleted.numDeletedRows).toBe(1n);
    const left = await db.selectFrom("scripts").select("title").execute();
    expect(left).toEqual([{ title: "In B" }]);
  });

  it("refuses an empty organisation", async () => {
    const db = await twoOrgs();
    expect(() => scoped(db, "")).toThrow();
  });
});

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: "utf8" })
    .filter((f) => f.endsWith(".ts"))
    .map((f) => join(dir, f));
}

describe("content queries", () => {
  // ADR 0008: all content queries go through one org-scoping helper. A
  // query on a content table must be called on a scope (`scope.selectFrom`,
  // `org.scope.updateTable`), never on the database or a transaction.
  const allowed = new Set(["scope.ts", "db/schema.ts"]);
  const tables = CONTENT_TABLES.join("|");
  const call = new RegExp(
    `(\\w+)\\s*\\.\\s*(selectFrom|insertInto|updateTable|deleteFrom|replaceInto|mergeInto)\\(\\s*["'\`](${tables})\\b`,
    "g",
  );
  const raw = new RegExp(
    `\\b(from|into|update|join)\\s+["\`]?(${tables})\\b`,
    "i",
  );

  function directQueries(source: string): string[] {
    const found: string[] = [];
    for (const m of source.matchAll(call))
      if (m[1] !== "scope") found.push(m[0].replace(/\s+/g, " "));
    for (const literal of source.matchAll(/sql`[^`]*`/g))
      if (raw.test(literal[0])) found.push(literal[0]);
    return found;
  }

  it.each(
    sourceFiles(SRC)
      .map((f) => relative(SRC, f))
      .filter((f) => !allowed.has(f) && !f.startsWith("db/migrations/")),
  )("%s doesn't query content tables directly", (file) => {
    expect(directQueries(readFileSync(join(SRC, file), "utf8"))).toEqual([]);
  });

  it("catches a direct query and allows a scoped one", () => {
    expect(directQueries('db.selectFrom("scripts")')).toHaveLength(1);
    expect(
      directQueries('deps.store.db\n  .updateTable("projects")'),
    ).toHaveLength(1);
    expect(directQueries('trx.insertInto("script_state")')).toHaveLength(1);
    expect(directQueries("sql`select * from scripts`")).toHaveLength(1);
    expect(directQueries('org.scope\n  .selectFrom("scripts")')).toEqual([]);
    expect(directQueries('db.selectFrom("users")')).toEqual([]);
  });
});
