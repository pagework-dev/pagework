import type { Instance } from "../lib/host.svelte.ts";
import { api, ApiFailure, useCsrfToken } from "./api.ts";

/** The signed-in person, as GET /api/session describes them. */
export interface SessionView {
  user: {
    id: string;
    email: string;
    displayName: string;
    instanceRole: "admin" | "user";
    mustChangePassword: boolean;
  };
  org: OrgView | null;
  orgs: OrgView[];
  csrfToken: string;
}

export type Role = "owner" | "admin" | "writer" | "commenter" | "reader";

export interface OrgView {
  id: string;
  name: string;
  role: Role;
}

export type Phase =
  | "loading"
  /** The server has no account yet. */
  | "setup"
  | "signIn"
  | "signedIn"
  /** Signed in, but the account must choose a new password first. */
  | "newPassword"
  /** The server didn't answer. */
  | "unreachable";

export const account = $state<{
  phase: Phase;
  instance: Instance | null;
  view: SessionView | null;
}>({ phase: "loading", instance: null, view: null });

function signedIn(view: SessionView): void {
  useCsrfToken(view.csrfToken);
  account.view = view;
  account.phase = view.user.mustChangePassword ? "newPassword" : "signedIn";
}

/** Where to start: setup, the sign-in screen, or straight in with a session. */
export async function loadAccount(instance: Instance): Promise<void> {
  account.instance = instance;
  if (instance.setupRequired) {
    account.phase = "setup";
    return;
  }
  await refreshSession();
}

export async function refreshSession(): Promise<void> {
  try {
    signedIn(await api<SessionView>("GET", "/session"));
  } catch (error) {
    account.view = null;
    useCsrfToken("");
    account.phase =
      error instanceof ApiFailure && error.status === 401
        ? "signIn"
        : "unreachable";
  }
}

export async function signIn(email: string, password: string): Promise<void> {
  await api("POST", "/session", { email, password });
  await refreshSession();
}

export interface SetupFields {
  code: string;
  displayName: string;
  email: string;
  password: string;
  orgName?: string;
}

export async function setUp(fields: SetupFields): Promise<void> {
  await api("POST", "/setup", fields);
  if (account.instance !== null) account.instance.setupRequired = false;
  await refreshSession();
}

export async function signOut(): Promise<void> {
  try {
    await api("DELETE", "/session");
  } finally {
    account.view = null;
    useCsrfToken("");
    account.phase = "signIn";
  }
}

export async function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  await api("POST", "/account/password", { currentPassword, newPassword });
  await refreshSession();
}

/** A request said the session has ended (signed out elsewhere, or expired). */
export function sessionEnded(): void {
  account.view = null;
  useCsrfToken("");
  account.phase = "signIn";
}
