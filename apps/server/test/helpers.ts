import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../src/app.ts";
import { setupGate } from "../src/auth/setup.ts";
import type { SessionView } from "../src/routes/auth.ts";
import { loadConfig, type Config } from "../src/config.ts";
import type { Deps } from "../src/context.ts";
import { openStore } from "../src/db/index.ts";
import { migrate } from "../src/db/migrate.ts";
import { memoryLogger } from "../src/log.ts";
import { loadTemplates } from "../src/templates.ts";
import { webApp } from "../src/web.ts";

export const SECRET = "test-secret-that-is-long-enough-0123456789";
export const SETUP_CODE = "ABCD-EFGH-JKLM";

const templates = loadTemplates();

export function testConfig(env: Record<string, string> = {}): Config {
  return loadConfig({
    PAGEWORK_MODE: "personal",
    PAGEWORK_SECRET: SECRET,
    PAGEWORK_URL: "http://localhost:3000",
    PAGEWORK_DATA_DIR: tmpdir(),
    DATABASE_URL: "sqlite::memory:",
    ...env,
  });
}

export function tempDir(): { path: string; remove: () => void } {
  const path = mkdtempSync(join(tmpdir(), "pagework-test-"));
  return {
    path,
    remove: () => {
      rmSync(path, { recursive: true, force: true });
    },
  };
}

/** A migrated in-memory server, and fetch that goes straight to it. */
export async function testServer(
  env: Record<string, string> = {},
  webDir = "/nonexistent",
) {
  const config = { ...testConfig(env), webDir };
  const store = openStore(config.database);
  const log = memoryLogger();
  await migrate(store, { backupDir: tempDir().path, log });
  let clock = new Date("2026-11-21T09:00:00.000Z");
  const deps: Deps = {
    config,
    store,
    log,
    web: webApp(webDir),
    now: () => clock,
    setup: setupGate(SETUP_CODE),
    templates,
  };
  const app = createApp(deps);
  return {
    app,
    deps,
    log,
    store,
    advance(ms: number) {
      clock = new Date(clock.getTime() + ms);
    },
    fetch: (path: string, init?: RequestInit) =>
      app.fetch(new Request(new URL(path, config.url), init)),
    close: () => store.close(),
  };
}

export type TestServer = Awaited<ReturnType<typeof testServer>>;

/** A browser's view of the server: keeps the cookie and sends the CSRF token. */
export function client(server: TestServer) {
  let cookie = "";
  let csrf = "";
  const call = async (
    method: string,
    path: string,
    body?: unknown,
    headers: Record<string, string> = {},
  ) => {
    const res = await server.fetch(path, {
      method,
      headers: {
        ...(cookie === "" ? {} : { cookie }),
        ...(csrf === "" || method === "GET" ? {} : { "x-csrf-token": csrf }),
        ...(body === undefined ? {} : { "content-type": "application/json" }),
        origin: "http://localhost:3000",
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const set = res.headers.get("set-cookie");
    if (set !== null) {
      const pair = set.split(";")[0] ?? "";
      cookie = pair.endsWith("=") ? "" : pair;
    }
    return res;
  };
  const self = {
    call,
    get: (path: string) => call("GET", path),
    post: (path: string, body?: unknown, headers?: Record<string, string>) =>
      call("POST", path, body ?? {}, headers),
    put: (path: string, body?: unknown) => call("PUT", path, body ?? {}),
    patch: (path: string, body?: unknown) => call("PATCH", path, body ?? {}),
    del: (path: string) => call("DELETE", path),
    get cookie() {
      return cookie;
    },
    set cookie(value: string) {
      cookie = value;
    },
    /** Reads the session and keeps its CSRF token. */
    async refresh() {
      const res = await call("GET", "/api/session");
      if (res.status !== 200) {
        csrf = "";
        return null;
      }
      const view = (await res.json()) as SessionView;
      csrf = view.csrfToken;
      return view;
    },
    async signIn(email: string, password: string) {
      const res = await call("POST", "/api/session", { email, password });
      if (res.status === 200) await self.refresh();
      return res;
    },
  };
  return self;
}

export const OWNER = {
  email: "writer@example.com",
  displayName: "Ada Writer",
  password: "a long enough password",
};

/** Runs first-run setup and returns the signed-in owner's client. */
export async function setUp(
  server: TestServer,
  extra: Record<string, string> = {},
) {
  const owner = client(server);
  const res = await owner.post("/api/setup", {
    code: SETUP_CODE,
    ...OWNER,
    ...extra,
  });
  if (res.status !== 201)
    throw new Error(`setup failed: ${String(res.status)} ${await res.text()}`);
  const view = await owner.refresh();
  if (view === null) throw new Error("no session after setup");
  return { owner, view };
}

/**
 * A second organisation with its own signed-in member, made directly in
 * the database (team mode's invitations come later), for isolation tests.
 */
export async function otherOrg(
  server: TestServer,
  role: "owner" | "admin" | "writer" | "commenter" | "reader" = "owner",
  options: { orgId?: string; email?: string } = {},
) {
  const { hashPassword } = await import("../src/auth/password.ts");
  const at = "2026-11-21T09:00:00.000Z";
  const orgId = options.orgId ?? crypto.randomUUID();
  const userId = crypto.randomUUID();
  const email = options.email ?? `${userId}@example.com`;
  const { db } = server.store;
  if (options.orgId === undefined)
    await db
      .insertInto("orgs")
      .values({ id: orgId, name: "Other", created_at: at })
      .execute();
  await db
    .insertInto("users")
    .values({
      id: userId,
      email,
      display_name: "Other Person",
      password_hash: await hashPassword("other person password"),
      status: "active",
      instance_role: "user",
      must_change_password: 0,
      failed_sign_ins: 0,
      locked_until: null,
      totp_secret: null,
      last_sign_in_at: null,
      created_at: at,
      updated_at: at,
    })
    .execute();
  await db
    .insertInto("memberships")
    .values({ org_id: orgId, user_id: userId, role, created_at: at })
    .execute();
  const person = client(server);
  const res = await person.signIn(email, "other person password");
  if (res.status !== 200) throw new Error("other person couldn't sign in");
  return { person, orgId, userId };
}
