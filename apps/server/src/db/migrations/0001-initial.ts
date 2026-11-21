import { binary, type Migration } from "./types.ts";

/**
 * Accounts, organisations and scripts. Every table holding content carries
 * org_id from this first migration (ADR 0008).
 */
export const migration: Migration = {
  async up(db) {
    await db.schema
      .createTable("orgs")
      .addColumn("id", "text", (c) => c.primaryKey())
      .addColumn("name", "text", (c) => c.notNull())
      .addColumn("created_at", "text", (c) => c.notNull())
      .execute();

    await db.schema
      .createTable("users")
      .addColumn("id", "text", (c) => c.primaryKey())
      .addColumn("email", "text", (c) => c.notNull().unique())
      .addColumn("display_name", "text", (c) => c.notNull())
      .addColumn("password_hash", "text")
      .addColumn("status", "text", (c) => c.notNull())
      .addColumn("instance_role", "text", (c) => c.notNull())
      .addColumn("must_change_password", "integer", (c) =>
        c.notNull().defaultTo(0),
      )
      .addColumn("failed_sign_ins", "integer", (c) => c.notNull().defaultTo(0))
      .addColumn("locked_until", "text")
      .addColumn("totp_secret", "text")
      .addColumn("last_sign_in_at", "text")
      .addColumn("created_at", "text", (c) => c.notNull())
      .addColumn("updated_at", "text", (c) => c.notNull())
      .execute();

    await db.schema
      .createTable("sessions")
      .addColumn("id", "text", (c) => c.primaryKey())
      .addColumn("user_id", "text", (c) =>
        c.notNull().references("users.id").onDelete("cascade"),
      )
      .addColumn("csrf_token", "text", (c) => c.notNull())
      .addColumn("org_id", "text", (c) =>
        c.references("orgs.id").onDelete("set null"),
      )
      .addColumn("user_agent", "text")
      .addColumn("created_at", "text", (c) => c.notNull())
      .addColumn("last_seen_at", "text", (c) => c.notNull())
      .addColumn("expires_at", "text", (c) => c.notNull())
      .execute();
    await db.schema
      .createIndex("sessions_user")
      .on("sessions")
      .column("user_id")
      .execute();

    await db.schema
      .createTable("memberships")
      .addColumn("org_id", "text", (c) =>
        c.notNull().references("orgs.id").onDelete("cascade"),
      )
      .addColumn("user_id", "text", (c) =>
        c.notNull().references("users.id").onDelete("cascade"),
      )
      .addColumn("role", "text", (c) => c.notNull())
      .addColumn("created_at", "text", (c) => c.notNull())
      .addPrimaryKeyConstraint("memberships_pk", ["org_id", "user_id"])
      .execute();
    await db.schema
      .createIndex("memberships_user")
      .on("memberships")
      .column("user_id")
      .execute();

    await db.schema
      .createTable("projects")
      .addColumn("id", "text", (c) => c.primaryKey())
      .addColumn("org_id", "text", (c) =>
        c.notNull().references("orgs.id").onDelete("cascade"),
      )
      .addColumn("name", "text", (c) => c.notNull())
      .addColumn("created_by", "text", (c) =>
        c.references("users.id").onDelete("set null"),
      )
      .addColumn("created_at", "text", (c) => c.notNull())
      .addColumn("updated_at", "text", (c) => c.notNull())
      .execute();
    await db.schema
      .createIndex("projects_org")
      .on("projects")
      .column("org_id")
      .execute();

    await db.schema
      .createTable("scripts")
      .addColumn("id", "text", (c) => c.primaryKey())
      .addColumn("org_id", "text", (c) =>
        c.notNull().references("orgs.id").onDelete("cascade"),
      )
      .addColumn("project_id", "text", (c) =>
        c.references("projects.id").onDelete("set null"),
      )
      .addColumn("title", "text", (c) => c.notNull())
      .addColumn("template_id", "text", (c) => c.notNull())
      // Deleting an account requires moving its scripts first (ADR 0012).
      .addColumn("owner_id", "text", (c) =>
        c.notNull().references("users.id").onDelete("restrict"),
      )
      .addColumn("created_at", "text", (c) => c.notNull())
      .addColumn("updated_at", "text", (c) => c.notNull())
      .execute();
    await db.schema
      .createIndex("scripts_org_updated")
      .on("scripts")
      .columns(["org_id", "updated_at"])
      .execute();

    await db.schema
      .createTable("script_state")
      .addColumn("script_id", "text", (c) =>
        c.primaryKey().references("scripts.id").onDelete("cascade"),
      )
      .addColumn("org_id", "text", (c) =>
        c.notNull().references("orgs.id").onDelete("cascade"),
      )
      .addColumn("ydoc", binary(db), (c) => c.notNull())
      .addColumn("fountain", "text", (c) => c.notNull())
      .addColumn("version", "integer", (c) => c.notNull())
      .addColumn("updated_at", "text", (c) => c.notNull())
      .execute();

    await db.schema
      .createTable("script_snapshots")
      .addColumn("id", "text", (c) => c.primaryKey())
      .addColumn("org_id", "text", (c) =>
        c.notNull().references("orgs.id").onDelete("cascade"),
      )
      .addColumn("script_id", "text", (c) =>
        c.notNull().references("scripts.id").onDelete("cascade"),
      )
      .addColumn("name", "text", (c) => c.notNull())
      .addColumn("kind", "text", (c) => c.notNull())
      .addColumn("fountain", "text", (c) => c.notNull())
      .addColumn("created_by", "text", (c) =>
        c.references("users.id").onDelete("set null"),
      )
      .addColumn("created_at", "text", (c) => c.notNull())
      .execute();
    await db.schema
      .createIndex("script_snapshots_script")
      .on("script_snapshots")
      .columns(["script_id", "created_at"])
      .execute();

    await db.schema
      .createTable("audit_log")
      .addColumn("id", "text", (c) => c.primaryKey())
      .addColumn("org_id", "text", (c) =>
        c.references("orgs.id").onDelete("cascade"),
      )
      // Kept when an account is deleted: the record of what happened stays.
      .addColumn("actor_id", "text")
      .addColumn("action", "text", (c) => c.notNull())
      .addColumn("target_type", "text")
      .addColumn("target_id", "text")
      .addColumn("detail", "text", (c) => c.notNull())
      .addColumn("created_at", "text", (c) => c.notNull())
      .execute();
    await db.schema
      .createIndex("audit_log_created")
      .on("audit_log")
      .column("created_at")
      .execute();

    await db.schema
      .createTable("settings")
      .addColumn("key", "text", (c) => c.primaryKey())
      .addColumn("value", "text", (c) => c.notNull())
      .execute();
  },
};
