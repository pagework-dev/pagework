/**
 * Table types for Kysely (ARCHITECTURE.md, Data model). They describe the
 * database after every migration has run.
 *
 * Portable between SQLite and PostgreSQL (ADR 0006): ids are UUID text,
 * times are ISO 8601 UTC text (which sorts correctly as text), true/false
 * is an integer 0 or 1, and binary data is a blob (bytea on PostgreSQL).
 */

/** ISO 8601 UTC, e.g. 2026-11-21T09:30:00.000Z */
export type Timestamp = string;
/** 0 or 1. */
export type Flag = 0 | 1;

export type AccountStatus = "active" | "invited" | "locked" | "disabled";
export type InstanceRole = "admin" | "user";
export type Role = "owner" | "admin" | "writer" | "commenter" | "reader";

export interface OrgsTable {
  id: string;
  name: string;
  created_at: Timestamp;
}

export interface UsersTable {
  id: string;
  /** Lower case; unique. */
  email: string;
  display_name: string;
  /** argon2id, PHC string format. Null until an invited person sets one. */
  password_hash: string | null;
  status: AccountStatus;
  instance_role: InstanceRole;
  must_change_password: Flag;
  failed_sign_ins: number;
  locked_until: Timestamp | null;
  /** Two-factor secret, encrypted (1.0). */
  totp_secret: string | null;
  last_sign_in_at: Timestamp | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface SessionsTable {
  /** HMAC of the cookie's random token; the token itself is never stored. */
  id: string;
  user_id: string;
  /** Sent back in a header on every change (CSRF protection). */
  csrf_token: string;
  /** The organisation the person is working in. */
  org_id: string | null;
  user_agent: string | null;
  created_at: Timestamp;
  last_seen_at: Timestamp;
  expires_at: Timestamp;
}

export interface MembershipsTable {
  org_id: string;
  user_id: string;
  role: Role;
  created_at: Timestamp;
}

export interface ProjectsTable {
  id: string;
  org_id: string;
  name: string;
  created_by: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface ScriptsTable {
  id: string;
  org_id: string;
  project_id: string | null;
  title: string;
  /** Also fixes the page size (screenplay-a4, screenplay-us). */
  template_id: string;
  owner_id: string;
  created_at: Timestamp;
  /** Last edited. */
  updated_at: Timestamp;
}

export interface ScriptStateTable {
  script_id: string;
  org_id: string;
  /** Yjs document state (ADR 0005). */
  ydoc: Uint8Array;
  /** Plain Fountain copy, written on every save. */
  fountain: string;
  /** Goes up by one on every save. */
  version: number;
  updated_at: Timestamp;
}

export type SnapshotKind =
  "named" | "before_import" | "before_restore" | "before_deletion";

export interface ScriptSnapshotsTable {
  id: string;
  org_id: string;
  script_id: string;
  name: string;
  kind: SnapshotKind;
  fountain: string;
  created_by: string | null;
  created_at: Timestamp;
}

export interface AuditLogTable {
  id: string;
  /** Null for actions on the instance itself (accounts, settings). */
  org_id: string | null;
  actor_id: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  /** JSON object with details; never passwords, tokens or script text. */
  detail: string;
  created_at: Timestamp;
}

export interface SettingsTable {
  key: string;
  value: string;
}

export interface Database {
  orgs: OrgsTable;
  users: UsersTable;
  sessions: SessionsTable;
  memberships: MembershipsTable;
  projects: ProjectsTable;
  scripts: ScriptsTable;
  script_state: ScriptStateTable;
  script_snapshots: ScriptSnapshotsTable;
  audit_log: AuditLogTable;
  settings: SettingsTable;
}

/**
 * Tables holding an organisation's content. Every query on them goes
 * through `scoped` in ../scope.ts (ADR 0008); a test fails if any other
 * file queries them directly.
 */
export const CONTENT_TABLES = [
  "projects",
  "scripts",
  "script_state",
  "script_snapshots",
] as const satisfies readonly (keyof Database)[];

export type ContentTable = (typeof CONTENT_TABLES)[number];
