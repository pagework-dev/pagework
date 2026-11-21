import { afterEach, describe, expect, it } from "vitest";
import {
  hashPassword,
  needsRehash,
  verifyPassword,
} from "../src/auth/password.ts";
import { rateLimiter } from "../src/auth/ratelimit.ts";
import { normaliseCode, newCode } from "../src/auth/tokens.ts";
import { LOCK_AFTER, LOCK_MS } from "../src/routes/auth.ts";
import {
  client,
  OWNER,
  SETUP_CODE,
  setUp,
  testServer,
  type TestServer,
} from "./helpers.ts";

let servers: TestServer[] = [];
afterEach(async () => {
  for (const s of servers) await s.close();
  servers = [];
});
async function server(env: Record<string, string> = {}) {
  const s = await testServer(env);
  servers.push(s);
  return s;
}

describe("passwords", () => {
  it("are hashed with argon2id and verify", async () => {
    const hash = await hashPassword("correct horse battery");
    expect(hash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(await verifyPassword("correct horse battery", hash)).toBe(true);
    expect(await verifyPassword("correct horse batterY", hash)).toBe(false);
    expect(needsRehash(hash)).toBe(false);
  });

  it("are salted", async () => {
    expect(await hashPassword("same password here")).not.toBe(
      await hashPassword("same password here"),
    );
  });

  it("notice weaker old hashes", async () => {
    const old = await hashPassword("x".repeat(12), {
      memory: 8192,
      passes: 1,
      parallelism: 1,
    });
    expect(await verifyPassword("x".repeat(12), old)).toBe(true);
    expect(needsRehash(old)).toBe(true);
  });
});

describe("setup codes and rate limits", () => {
  it("makes typeable codes and accepts them typed loosely", () => {
    const code = newCode();
    expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(normaliseCode(code.toLowerCase().replaceAll("-", " "))).toBe(code);
  });

  it("limits attempts in a sliding window", () => {
    const limit = rateLimiter(2, 1000);
    expect(limit.hit("a", 0)).toBe(0);
    expect(limit.hit("a", 100)).toBe(0);
    expect(limit.hit("a", 200)).toBe(1);
    expect(limit.hit("b", 200)).toBe(0);
    expect(limit.check("a", 1001)).toBe(0);
  });
});

describe("first-run setup", () => {
  it("is required until the first account exists", async () => {
    const s = await server();
    const before = (await (await s.fetch("/api/instance")).json()) as {
      setupRequired: boolean;
    };
    expect(before.setupRequired).toBe(true);
    const { view } = await setUp(s);
    expect(view.user).toMatchObject({
      email: OWNER.email,
      displayName: OWNER.displayName,
      instanceRole: "admin",
    });
    expect(view.org).toMatchObject({ role: "owner" });
    const after = (await (await s.fetch("/api/instance")).json()) as {
      setupRequired: boolean;
    };
    expect(after.setupRequired).toBe(false);
  });

  it("needs the setup code from the server's log", async () => {
    const s = await server();
    const c = client(s);
    const res = await c.post("/api/setup", {
      ...OWNER,
      code: "WRONG-CODE-0000",
    });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "invalid_setup_code" });
  });

  it("happens once", async () => {
    const s = await server();
    await setUp(s);
    const again = await client(s).post("/api/setup", {
      ...OWNER,
      email: "second@example.com",
      code: SETUP_CODE,
    });
    expect(again.status).toBe(409);
    const users = await s.store.db.selectFrom("users").select("id").execute();
    expect(users).toHaveLength(1);
  });

  it("checks the details", async () => {
    const s = await server();
    const c = client(s);
    const cases: [Record<string, string>, string][] = [
      [{ email: "not an email" }, "invalid_email"],
      [{ password: "short" }, "password_too_short"],
      [{ displayName: "   " }, "missing_field"],
    ];
    for (const [change, error] of cases) {
      const res = await c.post("/api/setup", {
        ...OWNER,
        code: SETUP_CODE,
        ...change,
      });
      expect(res.status).toBe(400);
      expect(((await res.json()) as { error: string }).error).toBe(error);
    }
  });

  it("asks for an organisation name in team mode", async () => {
    const s = await server({ PAGEWORK_MODE: "team" });
    const c = client(s);
    const res = await c.post("/api/setup", { ...OWNER, code: SETUP_CODE });
    expect(res.status).toBe(400);
    const { view } = await setUp(s, { orgName: "Harbour Films" });
    expect(view.org?.name).toBe("Harbour Films");
  });

  it("stores only the argon2id hash", async () => {
    const s = await server();
    await setUp(s);
    const user = await s.store.db
      .selectFrom("users")
      .selectAll()
      .executeTakeFirstOrThrow();
    expect(user.password_hash).toMatch(/^\$argon2id\$/);
    expect(JSON.stringify(user)).not.toContain(OWNER.password);
  });
});

describe("signing in", () => {
  it("is required for the session", async () => {
    const s = await server();
    await setUp(s);
    const res = await client(s).get("/api/session");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "signed_out" });
  });

  it("sets an HttpOnly, SameSite=Lax cookie holding a random token", async () => {
    const s = await server();
    await setUp(s);
    const res = await client(s).post("/api/session", {
      email: OWNER.email,
      password: OWNER.password,
    });
    expect(res.status).toBe(200);
    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie).toMatch(/^pagework_session=[\w-]{43};/);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Path=/");
    // The database keeps a keyed hash, never the token.
    const token = /=([\w-]+);/.exec(cookie)?.[1] ?? "";
    const rows = await s.store.db.selectFrom("sessions").select("id").execute();
    expect(rows.map((r) => r.id)).not.toContain(token);
  });

  it("marks the cookie Secure and __Host- on https", async () => {
    const s = await server({ PAGEWORK_URL: "https://scripts.example.com" });
    const c = client(s);
    const res = await c.post(
      "/api/setup",
      { ...OWNER, code: SETUP_CODE },
      { origin: "https://scripts.example.com" },
    );
    expect(res.status).toBe(201);
    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie).toMatch(/^__Host-pagework_session=/);
    expect(cookie).toContain("Secure");
  });

  it("is case-insensitive about the email address", async () => {
    const s = await server();
    await setUp(s);
    const c = client(s);
    expect(
      (await c.signIn("  Writer@Example.COM ", OWNER.password)).status,
    ).toBe(200);
  });

  it("says the same thing for a wrong password and an unknown address", async () => {
    const s = await server();
    await setUp(s);
    const wrong = await client(s).signIn(OWNER.email, "not the password");
    const unknown = await client(s).signIn("nobody@example.com", "whatever pw");
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(await wrong.json()).toEqual(await unknown.json());
  });

  it("locks the account after repeated failures, then unlocks by itself", async () => {
    const s = await server();
    await setUp(s);
    const c = client(s);
    for (let i = 1; i < LOCK_AFTER; i++)
      expect((await c.signIn(OWNER.email, "wrong password!")).status).toBe(401);
    const locked = await c.signIn(OWNER.email, "wrong password!");
    expect(locked.status).toBe(429);
    expect(await locked.json()).toMatchObject({ error: "too_many_attempts" });
    const row = await s.store.db
      .selectFrom("users")
      .select(["status", "locked_until"])
      .executeTakeFirstOrThrow();
    expect(row.status).toBe("locked");
    // Even the right password is refused while locked.
    expect((await c.signIn(OWNER.email, OWNER.password)).status).toBe(429);
    const audit = await s.store.db
      .selectFrom("audit_log")
      .select("action")
      .where("action", "=", "user.locked")
      .execute();
    expect(audit).toHaveLength(1);

    s.advance(LOCK_MS + 1000);
    expect((await c.signIn(OWNER.email, OWNER.password)).status).toBe(200);
    const after = await s.store.db
      .selectFrom("users")
      .select(["status", "failed_sign_ins"])
      .executeTakeFirstOrThrow();
    expect(after).toEqual({ status: "active", failed_sign_ins: 0 });
  });

  it("limits attempts for addresses with no account in the same way", async () => {
    const s = await server();
    await setUp(s);
    const c = client(s);
    let last = 0;
    for (let i = 0; i <= LOCK_AFTER; i++)
      last = (await c.signIn("nobody@example.com", "wrong password!")).status;
    expect(last).toBe(429);
  });

  it("refuses disabled accounts, but only after the right password", async () => {
    const s = await server();
    await setUp(s);
    await s.store.db.updateTable("users").set({ status: "disabled" }).execute();
    const c = client(s);
    expect((await c.signIn(OWNER.email, "wrong password!")).status).toBe(401);
    const res = await c.signIn(OWNER.email, OWNER.password);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "account_disabled" });
  });

  it("ends sessions of a disabled account", async () => {
    const s = await server();
    const { owner } = await setUp(s);
    await s.store.db.updateTable("users").set({ status: "disabled" }).execute();
    expect((await owner.get("/api/session")).status).toBe(401);
  });

  it("expires sessions after 30 days unused", async () => {
    const s = await server();
    const { owner } = await setUp(s);
    s.advance(29 * 24 * 3600 * 1000);
    expect((await owner.get("/api/session")).status).toBe(200);
    s.advance(29 * 24 * 3600 * 1000);
    expect((await owner.get("/api/session")).status).toBe(200);
    s.advance(31 * 24 * 3600 * 1000);
    expect((await owner.get("/api/session")).status).toBe(401);
  });

  it("signs out", async () => {
    const s = await server();
    const { owner } = await setUp(s);
    const cookie = owner.cookie;
    expect((await owner.del("/api/session")).status).toBe(200);
    owner.cookie = cookie;
    expect((await owner.get("/api/session")).status).toBe(401);
  });
});

describe("cross-site request forgery", () => {
  it("refuses changes from another origin", async () => {
    const s = await server();
    await setUp(s);
    const res = await client(s).post(
      "/api/session",
      { email: OWNER.email, password: OWNER.password },
      { origin: "https://evil.example" },
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "cross_origin" });
  });

  it("refuses cross-site requests without an Origin header", async () => {
    const s = await server();
    const res = await s.fetch("/api/session", {
      method: "POST",
      headers: {
        "sec-fetch-site": "cross-site",
        "content-type": "application/json",
      },
      body: "{}",
    });
    expect(res.status).toBe(403);
  });

  it("needs the session's token for signed-in changes", async () => {
    const s = await server();
    const { owner } = await setUp(s);
    const res = await owner.call("DELETE", "/api/session", undefined, {
      "x-csrf-token": "guessed",
    });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "csrf_token" });
    expect((await owner.get("/api/session")).status).toBe(200);
  });
});

describe("changing the password", () => {
  it("needs the current password and signs out other sessions", async () => {
    const s = await server();
    const { owner } = await setUp(s);
    const other = client(s);
    await other.signIn(OWNER.email, OWNER.password);

    const wrong = await owner.post("/api/account/password", {
      currentPassword: "not it at all",
      newPassword: "a brand new password",
    });
    expect(wrong.status).toBe(403);

    const ok = await owner.post("/api/account/password", {
      currentPassword: OWNER.password,
      newPassword: "a brand new password",
    });
    expect(ok.status).toBe(200);
    expect((await owner.get("/api/session")).status).toBe(200);
    expect((await other.get("/api/session")).status).toBe(401);
    expect((await client(s).signIn(OWNER.email, OWNER.password)).status).toBe(
      401,
    );
    expect(
      (await client(s).signIn(OWNER.email, "a brand new password")).status,
    ).toBe(200);
  });

  it("is the only thing allowed while a change is required", async () => {
    const s = await server();
    const { owner } = await setUp(s);
    await s.store.db
      .updateTable("users")
      .set({ must_change_password: 1 })
      .execute();
    const view = await owner.refresh();
    expect(view).not.toBeNull();
    const ok = await owner.post("/api/account/password", {
      currentPassword: OWNER.password,
      newPassword: "a brand new password",
    });
    expect(ok.status).toBe(200);
    const after = (await (await owner.get("/api/session")).json()) as {
      user: { mustChangePassword: boolean };
    };
    expect(after.user.mustChangePassword).toBe(false);
  });
});

describe("logs", () => {
  it("never contain passwords or tokens", async () => {
    const s = await server();
    const { owner } = await setUp(s);
    await client(s).signIn(OWNER.email, "wrong password!");
    const all = JSON.stringify(s.log.lines);
    expect(all).not.toContain(OWNER.password);
    expect(all).not.toContain(owner.cookie.split("=")[1] ?? "x");
  });
});
