import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { audit } from "../audit.ts";
import type { AppEnv, Deps } from "../context.ts";
import { badRequest, notFound } from "../errors.ts";
import { requireOrg, type OrgContext } from "../permissions.ts";
import { readSyncBody } from "../scripts/documents.ts";
import { applyUpdate, createScript } from "../scripts/store.ts";
import { id, jsonBody, text, type Body } from "../validate.ts";

export interface ScriptView {
  id: string;
  title: string;
  templateId: string;
  projectId: string | null;
  ownerId: string;
  ownerName: string;
  createdAt: string;
  updatedAt: string;
}

/** Longest script title, in characters. */
export const TITLE_MAX = 200;

export function scriptQuery(org: OrgContext) {
  return org.scope
    .selectFrom("scripts")
    .innerJoin("users", "users.id", "scripts.owner_id")
    .select([
      "scripts.id",
      "scripts.title",
      "scripts.template_id",
      "scripts.project_id",
      "scripts.owner_id",
      "users.display_name",
      "scripts.created_at",
      "scripts.updated_at",
    ]);
}

type ScriptRow = Awaited<
  ReturnType<ReturnType<typeof scriptQuery>["executeTakeFirstOrThrow"]>
>;

export function scriptView(row: ScriptRow): ScriptView {
  return {
    id: row.id,
    title: row.title,
    templateId: row.template_id,
    projectId: row.project_id,
    ownerId: row.owner_id,
    ownerName: row.display_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function findScript(
  org: OrgContext,
  scriptId: string,
): Promise<ScriptView> {
  const row = await scriptQuery(org)
    .where("scripts.id", "=", scriptId)
    .executeTakeFirst();
  if (row === undefined) throw notFound();
  return scriptView(row);
}

/** A title: one line, trimmed; empty means untitled. */
export function title(body: Body): string {
  const value = text(body, "title", { max: TITLE_MAX * 4 })
    .replace(/\s+/g, " ")
    .trim();
  if (Array.from(value).length > TITLE_MAX)
    throw badRequest("field_too_long", { field: "title" });
  return value;
}

export function scriptRoutes(deps: Deps): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();
  const { db } = deps.store;

  const templateId = (body: Body): string => {
    const value = text(body, "templateId", { max: 100 });
    if (deps.templates.byId(value) === undefined)
      throw badRequest("unknown_template");
    return value;
  };

  const projectId = async (
    org: OrgContext,
    body: Body,
  ): Promise<string | null> => {
    const value = body.projectId;
    if (value === null || value === undefined) return null;
    if (typeof value !== "string") throw badRequest("invalid_field");
    const project = await org.scope
      .selectFrom("projects")
      .select("id")
      .where("id", "=", id(value))
      .executeTakeFirst();
    if (project === undefined) throw badRequest("unknown_project");
    return project.id;
  };

  const scriptId = (c: Context<AppEnv>): string => id(c.req.param("id"));

  routes.get("/scripts", async (c) => {
    const org = await requireOrg(deps, c, "read");
    const rows = await scriptQuery(org)
      .orderBy("scripts.updated_at", "desc")
      .orderBy("scripts.id")
      .execute();
    return c.json({ scripts: rows.map(scriptView), role: org.role });
  });

  routes.post("/scripts", async (c) => {
    const org = await requireOrg(deps, c, "write");
    const body = await jsonBody(c);
    const now = deps.now();
    const created = await createScript(db, org.orgId, {
      title: body.title === undefined ? "" : title(body),
      templateId: templateId(body),
      projectId: await projectId(org, body),
      ownerId: org.session.user.id,
      text: "",
      now,
    });
    await audit(db, now, {
      orgId: org.orgId,
      actorId: org.session.user.id,
      action: "script.created",
      targetType: "script",
      targetId: created,
    });
    return c.json(await findScript(org, created), 201);
  });

  routes.get("/scripts/:id", async (c) => {
    const org = await requireOrg(deps, c, "read");
    const script = await findScript(org, scriptId(c));
    const state = await org.scope
      .selectFrom("script_state")
      .select("version")
      .where("script_id", "=", script.id)
      .executeTakeFirstOrThrow();
    return c.json({ ...script, version: state.version, role: org.role });
  });

  routes.patch("/scripts/:id", async (c) => {
    const org = await requireOrg(deps, c, "write");
    const script = await findScript(org, scriptId(c));
    const body = await jsonBody(c);
    const changes: {
      title?: string;
      template_id?: string;
      project_id?: string | null;
    } = {};
    if (body.title !== undefined) changes.title = title(body);
    if (body.templateId !== undefined) changes.template_id = templateId(body);
    if (body.projectId !== undefined)
      changes.project_id = await projectId(org, body);
    if (Object.keys(changes).length > 0) {
      await org.scope
        .updateTable("scripts")
        .set(changes)
        .where("id", "=", script.id)
        .execute();
      if (changes.title !== undefined && changes.title !== script.title)
        await audit(db, deps.now(), {
          orgId: org.orgId,
          actorId: org.session.user.id,
          action: "script.renamed",
          targetType: "script",
          targetId: script.id,
        });
    }
    return c.json(await findScript(org, script.id));
  });

  routes.delete("/scripts/:id", async (c) => {
    const org = await requireOrg(deps, c, "write");
    const script = await findScript(org, scriptId(c));
    await org.scope.deleteFrom("scripts").where("id", "=", script.id).execute();
    await audit(db, deps.now(), {
      orgId: org.orgId,
      actorId: org.session.user.id,
      action: "script.deleted",
      targetType: "script",
      targetId: script.id,
      detail: { title: script.title },
    });
    return c.json({ ok: true });
  });

  routes.get("/scripts/:id/state", async (c) => {
    const org = await requireOrg(deps, c, "read");
    const row = await org.scope
      .selectFrom("script_state")
      .select(["ydoc", "version"])
      .where("script_id", "=", scriptId(c))
      .executeTakeFirst();
    if (row === undefined) throw notFound();
    return c.body(row.ydoc as Uint8Array<ArrayBuffer>, 200, {
      "Content-Type": "application/octet-stream",
      "X-Pagework-Version": String(row.version),
    });
  });

  // Batched Yjs updates from the editor: about one request a second while
  // typing, plus on blur and when the page is hidden.
  routes.post(
    "/scripts/:id/sync",
    bodyLimit({
      maxSize: 8 * 1024 * 1024,
      onError: () => {
        throw badRequest("body_too_large");
      },
    }),
    async (c) => {
      const org = await requireOrg(deps, c, "write");
      const target = scriptId(c);
      const { update, vector } = readSyncBody(
        new Uint8Array(await c.req.arrayBuffer()),
      );
      const saved = await applyUpdate(
        db,
        org.orgId,
        target,
        update,
        vector,
        deps.now(),
      );
      return c.body(
        (saved.missing ?? new Uint8Array()) as Uint8Array<ArrayBuffer>,
        200,
        {
          "Content-Type": "application/octet-stream",
          "X-Pagework-Version": String(saved.version),
          "X-Pagework-Updated": saved.updatedAt,
        },
      );
    },
  );

  routes.get("/scripts/:id/fountain", async (c) => {
    const org = await requireOrg(deps, c, "read");
    const row = await org.scope
      .selectFrom("script_state")
      .select("fountain")
      .where("script_id", "=", scriptId(c))
      .executeTakeFirst();
    if (row === undefined) throw notFound();
    return c.text(row.fountain);
  });

  return routes;
}
