import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { audit } from "../audit.ts";
import {
  hashPassword,
  needsRehash,
  passwordProblem,
  verifyNothing,
  verifyPassword,
} from "../auth/password.ts";
import { rateLimiter } from "../auth/ratelimit.ts";
import {
  clearSessionCookie,
  endAllSessions,
  endSession,
  startSession,
  type Session,
} from "../auth/sessions.ts";
import { setupRequired } from "../auth/setup.ts";
import type { AppEnv, Deps } from "../context.ts";
import type { Role } from "../db/schema.ts";
import { ApiError, badRequest } from "../errors.ts";
import { clientAddress, requireSession } from "../middleware.ts";
import { email, jsonBody, name, text } from "../validate.ts";

/** Failed sign-ins in a row before the account locks (ARCHITECTURE.md). */
export const LOCK_AFTER = 10;
/** How long a locked account stays locked unless an admin unlocks it. */
export const LOCK_MS = 15 * 60 * 1000;
const WINDOW_MS = 15 * 60 * 1000;

export interface SessionView {
  user: {
    id: string;
    email: string;
    displayName: string;
    instanceRole: "admin" | "user";
    mustChangePassword: boolean;
  };
  org: { id: string; name: string; role: Role } | null;
  orgs: { id: string; name: string; role: Role }[];
  csrfToken: string;
}

export async function sessionView(
  deps: Deps,
  session: Session,
): Promise<SessionView> {
  const orgs = await deps.store.db
    .selectFrom("memberships")
    .innerJoin("orgs", "orgs.id", "memberships.org_id")
    .select(["orgs.id", "orgs.name", "memberships.role"])
    .where("memberships.user_id", "=", session.user.id)
    .orderBy("orgs.name")
    .execute();
  return {
    user: {
      id: session.user.id,
      email: session.user.email,
      displayName: session.user.displayName,
      instanceRole: session.user.instanceRole,
      mustChangePassword: session.user.mustChangePassword,
    },
    org: orgs.find((o) => o.id === session.orgId) ?? null,
    orgs,
    csrfToken: session.csrfToken,
  };
}

function checkPassword(password: string): void {
  const problem = passwordProblem(password);
  if (problem !== null) throw badRequest(problem);
}

export function authRoutes(deps: Deps): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();
  const { db } = deps.store;
  const byAddress = rateLimiter(30, WINDOW_MS);
  const byEmail = rateLimiter(LOCK_AFTER, WINDOW_MS);
  const setupTries = rateLimiter(10, WINDOW_MS);
  const small = bodyLimit({
    maxSize: 16 * 1024,
    onError: () => {
      throw badRequest("body_too_large");
    },
  });

  const tooMany = (seconds: number): ApiError =>
    new ApiError(429, "too_many_attempts", { retryAfter: seconds });

  /** After sign-in or setup: the session, with the organisation it opens in. */
  const signedIn = async (c: Context<AppEnv>, userId: string) => {
    const first = await db
      .selectFrom("memberships")
      .select("org_id")
      .where("user_id", "=", userId)
      .orderBy("created_at")
      .limit(1)
      .executeTakeFirst();
    await startSession(deps, c, userId, first?.org_id ?? null);
  };

  routes.post("/setup", small, async (c) => {
    const now = deps.now();
    const address = clientAddress(deps, c);
    const wait = setupTries.hit(address, now.getTime());
    if (wait > 0) throw tooMany(wait);
    if (!(await setupRequired(db))) throw new ApiError(409, "already_set_up");

    const body = await jsonBody(c);
    if (!deps.setup.matches(text(body, "code", { max: 64 })))
      throw new ApiError(403, "invalid_setup_code");
    const address_ = email(body);
    const displayName = name(body, "displayName", 100);
    const password = text(body, "password", { max: 1024 });
    checkPassword(password);
    const orgName =
      deps.config.mode === "personal"
        ? displayName
        : name(body, "orgName", 100);
    const hash = await hashPassword(password);

    const userId = crypto.randomUUID();
    const orgId = crypto.randomUUID();
    const at = now.toISOString();
    await db.transaction().execute(async (trx) => {
      // A unique key: if two setups race, the second fails here.
      await trx
        .insertInto("settings")
        .values({ key: "setup_completed_at", value: at })
        .execute();
      await trx
        .insertInto("users")
        .values({
          id: userId,
          email: address_,
          display_name: displayName,
          password_hash: hash,
          status: "active",
          // The first account is the first instance admin (ADR 0012).
          instance_role: "admin",
          must_change_password: 0,
          failed_sign_ins: 0,
          locked_until: null,
          totp_secret: null,
          last_sign_in_at: at,
          created_at: at,
          updated_at: at,
        })
        .execute();
      await trx
        .insertInto("orgs")
        .values({ id: orgId, name: orgName, created_at: at })
        .execute();
      await trx
        .insertInto("memberships")
        .values({
          org_id: orgId,
          user_id: userId,
          role: "owner",
          created_at: at,
        })
        .execute();
      await audit(trx, now, {
        orgId: null,
        actorId: userId,
        action: "instance.set_up",
        targetType: "user",
        targetId: userId,
      });
    });
    deps.setup.done();
    deps.log.info("First account created; setup is complete");
    await signedIn(c, userId);
    return c.json({ ok: true }, 201);
  });

  routes.post("/session", small, async (c) => {
    const now = deps.now();
    const nowMs = now.getTime();
    const body = await jsonBody(c);
    const address = email(body);
    const password = text(body, "password", { max: 1024 });
    const ip = clientAddress(deps, c);

    const wait = Math.max(
      byAddress.check(ip, nowMs),
      byEmail.check(address, nowMs),
    );
    if (wait > 0) throw tooMany(wait);

    const user = await db
      .selectFrom("users")
      .selectAll()
      .where("email", "=", address)
      .executeTakeFirst();

    if (
      user?.status === "locked" &&
      user.locked_until !== null &&
      user.locked_until > now.toISOString()
    ) {
      byAddress.hit(ip, nowMs);
      throw tooMany(
        Math.ceil((new Date(user.locked_until).getTime() - nowMs) / 1000),
      );
    }

    const ok =
      user?.password_hash != null
        ? await verifyPassword(password, user.password_hash)
        : await verifyNothing(password);

    if (!ok || user === undefined) {
      byAddress.hit(ip, nowMs);
      byEmail.hit(address, nowMs);
      if (user !== undefined) {
        // A lock that has run out starts the count again.
        const failures =
          (user.status === "locked" ? 0 : user.failed_sign_ins) + 1;
        const lock = failures >= LOCK_AFTER && user.status !== "disabled";
        await db
          .updateTable("users")
          .set({
            failed_sign_ins: failures,
            ...(lock
              ? {
                  status: "locked",
                  locked_until: new Date(nowMs + LOCK_MS).toISOString(),
                }
              : {}),
          })
          .where("id", "=", user.id)
          .execute();
        if (lock) {
          deps.log.warn("Account locked after failed sign-ins", {
            user: user.id,
          });
          await audit(db, now, {
            orgId: null,
            actorId: null,
            action: "user.locked",
            targetType: "user",
            targetId: user.id,
            detail: { failures },
          });
          throw tooMany(Math.ceil(LOCK_MS / 1000));
        }
      }
      throw new ApiError(401, "invalid_credentials");
    }

    // Only someone who knows the password learns the account is disabled.
    if (user.status === "disabled") throw new ApiError(403, "account_disabled");

    byEmail.forget(address);
    await db
      .updateTable("users")
      .set({
        failed_sign_ins: 0,
        last_sign_in_at: now.toISOString(),
        ...(user.status === "locked"
          ? { status: "active", locked_until: null }
          : {}),
        ...(needsRehash(user.password_hash ?? "")
          ? { password_hash: await hashPassword(password) }
          : {}),
      })
      .where("id", "=", user.id)
      .execute();
    await signedIn(c, user.id);
    return c.json({ ok: true });
  });

  routes.get("/session", async (c) => {
    const session = c.get("session");
    if (session === null) throw new ApiError(401, "signed_out");
    return c.json(await sessionView(deps, session));
  });

  routes.delete("/session", async (c) => {
    const session = requireSession(c, { duringPasswordChange: true });
    await endSession(deps, session.id);
    clearSessionCookie(deps, c);
    return c.json({ ok: true });
  });

  routes.post("/account/password", small, async (c) => {
    const session = requireSession(c, { duringPasswordChange: true });
    const body = await jsonBody(c);
    const current = text(body, "currentPassword", { max: 1024 });
    const next = text(body, "newPassword", { max: 1024 });
    checkPassword(next);
    const user = await db
      .selectFrom("users")
      .select("password_hash")
      .where("id", "=", session.user.id)
      .executeTakeFirstOrThrow();
    if (
      user.password_hash === null ||
      !(await verifyPassword(current, user.password_hash))
    )
      throw new ApiError(403, "wrong_password");
    const now = deps.now();
    await db
      .updateTable("users")
      .set({
        password_hash: await hashPassword(next),
        must_change_password: 0,
        updated_at: now.toISOString(),
      })
      .where("id", "=", session.user.id)
      .execute();
    // Anyone else signed in with the old password is signed out.
    await endAllSessions(deps, session.user.id, session.id);
    await audit(db, now, {
      orgId: null,
      actorId: session.user.id,
      action: "user.password_changed",
      targetType: "user",
      targetId: session.user.id,
    });
    return c.json({ ok: true });
  });

  return routes;
}
