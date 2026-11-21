import { getConnInfo } from "@hono/node-server/conninfo";
import type { Context, MiddlewareHandler } from "hono";
import { loadSession, type Session } from "./auth/sessions.ts";
import { sameToken } from "./auth/tokens.ts";
import type { AppEnv, Deps } from "./context.ts";
import { ApiError } from "./errors.ts";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function isSafe(method: string): boolean {
  return SAFE_METHODS.has(method.toUpperCase());
}

/**
 * Cross-site request forgery, first line (ARCHITECTURE.md, Authentication):
 * a request that changes something must come from a page on this server.
 * Browsers always send Origin with such requests; Sec-Fetch-Site covers
 * older ones. Requests with neither come from tools like curl, which
 * can't carry a victim's cookie; they still need the CSRF token below.
 */
export function sameOrigin(deps: Deps): MiddlewareHandler<AppEnv> {
  const expected = deps.config.url.origin;
  return async (c, next) => {
    if (!isSafe(c.req.method)) {
      const origin = c.req.header("origin");
      const site = c.req.header("sec-fetch-site");
      if (origin !== undefined ? origin !== expected : site === "cross-site")
        throw new ApiError(403, "cross_origin");
    }
    await next();
  };
}

/** Loads the signed-in session, if any, for every API request. */
export function sessions(deps: Deps): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    c.set("session", await loadSession(deps, c));
    await next();
  };
}

export interface RequireOptions {
  /** Routes still usable while the account must choose a new password. */
  duringPasswordChange?: boolean;
}

/**
 * The signed-in session, or a 401. For requests that change something,
 * also checks the CSRF token the web app sends in X-CSRF-Token: a page on
 * another site can't read it, so it can't send it.
 */
export function requireSession(
  c: Context<AppEnv>,
  options: RequireOptions = {},
): Session {
  const session = c.get("session");
  if (session === null) throw new ApiError(401, "signed_out");
  if (!isSafe(c.req.method)) {
    const token = c.req.header("x-csrf-token") ?? "";
    if (!sameToken(token, session.csrfToken))
      throw new ApiError(403, "csrf_token");
  }
  if (session.user.mustChangePassword && options.duringPasswordChange !== true)
    throw new ApiError(403, "password_change_required");
  return session;
}

/**
 * The visitor's address, for rate limits. Behind a reverse proxy
 * (PAGEWORK_TRUST_PROXY) it is the last address in X-Forwarded-For, the
 * one the proxy itself added; earlier entries can be forged by the client.
 */
export function clientAddress(deps: Deps, c: Context): string {
  if (deps.config.trustProxy) {
    const forwarded = c.req.header("x-forwarded-for");
    const last = forwarded?.split(",").at(-1)?.trim();
    if (last !== undefined && last !== "") return last;
  }
  try {
    return getConnInfo(c).remote.address ?? "unknown";
  } catch {
    // Not running behind Node's HTTP server (tests call app.fetch).
    return "unknown";
  }
}
