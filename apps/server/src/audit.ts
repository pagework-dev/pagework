import type { Kysely } from "kysely";
import type { Database } from "./db/schema.ts";

/**
 * The audit log (ARCHITECTURE.md, Data model): who did what, to which
 * script or account, and when. Details never include passwords, tokens or
 * script text.
 */
export interface AuditEntry {
  /** Null for actions on the instance itself, such as accounts. */
  orgId: string | null;
  actorId: string | null;
  action: string;
  targetType?: "user" | "org" | "script" | "project" | "snapshot" | "invite";
  targetId?: string;
  detail?: Record<string, string | number | boolean | null>;
}

export async function audit(
  db: Kysely<Database>,
  now: Date,
  entry: AuditEntry,
): Promise<void> {
  await db
    .insertInto("audit_log")
    .values({
      id: crypto.randomUUID(),
      org_id: entry.orgId,
      actor_id: entry.actorId,
      action: entry.action,
      target_type: entry.targetType ?? null,
      target_id: entry.targetId ?? null,
      detail: JSON.stringify(entry.detail ?? {}),
      created_at: now.toISOString(),
    })
    .execute();
}
