import type { Context } from "hono";
import type { AppEnv, Deps } from "./context.ts";
import type { Role } from "./db/schema.ts";
import { ApiError } from "./errors.ts";
import { requireSession, type RequireOptions } from "./middleware.ts";
import { scoped, type OrgScope } from "./scope.ts";
import type { Session } from "./auth/sessions.ts";

/**
 * What each organisation role may do (ADR 0008). Checked on the server for
 * every request; the web app only hides what a role can't use.
 */
export type Action =
  /** Read scripts, snapshots and comments; export. */
  | "read"
  /** Add comments and notes (0.4). */
  | "comment"
  /** Write scripts; create, rename and delete scripts, projects and snapshots. */
  | "write"
  /** Invite and remove members, change roles, transfer scripts (0.4). */
  | "manage_members"
  /** Rename or delete the organisation (0.4). */
  | "manage_org";

const ALLOWED: Record<Role, readonly Action[]> = {
  owner: ["read", "comment", "write", "manage_members", "manage_org"],
  admin: ["read", "comment", "write", "manage_members"],
  writer: ["read", "comment", "write"],
  commenter: ["read", "comment"],
  reader: ["read"],
};

export function can(role: Role, action: Action): boolean {
  return ALLOWED[role].includes(action);
}

export interface OrgContext {
  session: Session;
  orgId: string;
  role: Role;
  /** Queries limited to this organisation. */
  scope: OrgScope;
}

/**
 * The organisation the session is working in, with the caller's role read
 * fresh from the database (a role can change while someone is signed in).
 * Throws unless the role allows the action.
 */
export async function requireOrg(
  deps: Deps,
  c: Context<AppEnv>,
  action: Action,
  options: RequireOptions = {},
): Promise<OrgContext> {
  const session = requireSession(c, options);
  if (session.orgId === null) throw new ApiError(403, "no_organisation");
  const membership = await deps.store.db
    .selectFrom("memberships")
    .select("role")
    .where("org_id", "=", session.orgId)
    .where("user_id", "=", session.user.id)
    .executeTakeFirst();
  if (membership === undefined) throw new ApiError(403, "no_organisation");
  if (!can(membership.role, action)) throw new ApiError(403, "not_allowed");
  return {
    session,
    orgId: session.orgId,
    role: membership.role,
    scope: scoped(deps.store.db, session.orgId),
  };
}
