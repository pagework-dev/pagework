import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { Config } from "../config.ts";
import type { AccountStatus, InstanceRole } from "../db/schema.ts";
import type { Deps } from "../context.ts";
import { newToken, tokenHash } from "./tokens.ts";

/**
 * Server-side sessions (ARCHITECTURE.md, Authentication). The cookie holds
 * only a random token; the database holds its HMAC, so a copy of the
 * database can't be used to sign in. Sessions end after 30 days without
 * use, and after 90 days in any case.
 */

export const IDLE_MS = 30 * 24 * 60 * 60 * 1000;
export const ABSOLUTE_MS = 90 * 24 * 60 * 60 * 1000;
/** last_seen_at is written at most this often, not on every request. */
const TOUCH_MS = 60 * 60 * 1000;

export interface SessionUser {
  id: string;
  email: string;
  displayName: string;
  status: AccountStatus;
  instanceRole: InstanceRole;
  mustChangePassword: boolean;
}

export interface Session {
  id: string;
  csrfToken: string;
  orgId: string | null;
  user: SessionUser;
}

/**
 * `__Host-` makes the browser refuse the cookie unless it is Secure, for
 * this exact host and the whole site. Plain-http addresses (localhost, or
 * PAGEWORK_INSECURE_HTTP) can't use Secure cookies, so they get a plain name.
 */
export function cookieName(config: Pick<Config, "url">): string {
  return config.url.protocol === "https:"
    ? "__Host-pagework_session"
    : "pagework_session";
}

function expiry(created: Date, now: Date): string {
  return new Date(
    Math.min(created.getTime() + ABSOLUTE_MS, now.getTime() + IDLE_MS),
  ).toISOString();
}

export async function startSession(
  deps: Deps,
  c: Context,
  userId: string,
  orgId: string | null,
): Promise<Session["id"]> {
  const token = newToken();
  const now = deps.now();
  const id = tokenHash(deps.config.secret, token);
  await deps.store.db
    .insertInto("sessions")
    .values({
      id,
      user_id: userId,
      csrf_token: newToken(),
      org_id: orgId,
      user_agent: c.req.header("user-agent")?.slice(0, 200) ?? null,
      created_at: now.toISOString(),
      last_seen_at: now.toISOString(),
      expires_at: expiry(now, now),
    })
    .execute();
  setCookie(c, cookieName(deps.config), token, {
    httpOnly: true,
    secure: deps.config.url.protocol === "https:",
    sameSite: "Lax",
    path: "/",
    maxAge: Math.floor(IDLE_MS / 1000),
  });
  return id;
}

export function clearSessionCookie(deps: Deps, c: Context): void {
  deleteCookie(c, cookieName(deps.config), {
    path: "/",
    secure: deps.config.url.protocol === "https:",
  });
}

/** The session the request's cookie belongs to, if it is still valid. */
export async function loadSession(
  deps: Deps,
  c: Context,
): Promise<Session | null> {
  const token = getCookie(c, cookieName(deps.config));
  if (token === undefined || token.length > 200) return null;
  const id = tokenHash(deps.config.secret, token);
  const now = deps.now();
  const row = await deps.store.db
    .selectFrom("sessions")
    .innerJoin("users", "users.id", "sessions.user_id")
    .select([
      "sessions.id",
      "sessions.csrf_token",
      "sessions.org_id",
      "sessions.created_at",
      "sessions.last_seen_at",
      "sessions.expires_at",
      "users.id as user_id",
      "users.email",
      "users.display_name",
      "users.status",
      "users.instance_role",
      "users.must_change_password",
    ])
    .where("sessions.id", "=", id)
    .executeTakeFirst();
  if (row === undefined) return null;
  if (row.expires_at <= now.toISOString() || row.status === "disabled") {
    await endSession(deps, row.id);
    return null;
  }
  if (now.getTime() - new Date(row.last_seen_at).getTime() > TOUCH_MS)
    await deps.store.db
      .updateTable("sessions")
      .set({
        last_seen_at: now.toISOString(),
        expires_at: expiry(new Date(row.created_at), now),
      })
      .where("id", "=", row.id)
      .execute();
  return {
    id: row.id,
    csrfToken: row.csrf_token,
    orgId: row.org_id,
    user: {
      id: row.user_id,
      email: row.email,
      displayName: row.display_name,
      status: row.status,
      instanceRole: row.instance_role,
      mustChangePassword: row.must_change_password === 1,
    },
  };
}

export async function endSession(deps: Deps, id: string): Promise<void> {
  await deps.store.db.deleteFrom("sessions").where("id", "=", id).execute();
}

/** Signs an account out everywhere, optionally keeping one session. */
export async function endAllSessions(
  deps: Deps,
  userId: string,
  except: string | null = null,
): Promise<void> {
  let query = deps.store.db
    .deleteFrom("sessions")
    .where("user_id", "=", userId);
  if (except !== null) query = query.where("id", "!=", except);
  await query.execute();
}
