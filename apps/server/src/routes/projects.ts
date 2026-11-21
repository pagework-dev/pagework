import { Hono } from "hono";
import { audit } from "../audit.ts";
import type { AppEnv, Deps } from "../context.ts";
import { notFound } from "../errors.ts";
import { requireOrg, type OrgContext } from "../permissions.ts";
import { scoped } from "../scope.ts";
import { id, jsonBody, name } from "../validate.ts";

/** Projects group related scripts: a feature, a series, a season. */
export interface ProjectView {
  id: string;
  name: string;
  createdAt: string;
}

export function projectRoutes(deps: Deps): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();
  const { db } = deps.store;

  const find = async (org: OrgContext, projectId: string) => {
    const row = await org.scope
      .selectFrom("projects")
      .select(["id", "name", "created_at"])
      .where("id", "=", projectId)
      .executeTakeFirst();
    if (row === undefined) throw notFound();
    return row;
  };
  const view = (row: {
    id: string;
    name: string;
    created_at: string;
  }): ProjectView => ({
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
  });

  routes.get("/projects", async (c) => {
    const org = await requireOrg(deps, c, "read");
    const rows = await org.scope
      .selectFrom("projects")
      .select(["id", "name", "created_at"])
      .orderBy("name")
      .execute();
    return c.json({ projects: rows.map(view) });
  });

  routes.post("/projects", async (c) => {
    const org = await requireOrg(deps, c, "write");
    const body = await jsonBody(c);
    const now = deps.now();
    const projectId = crypto.randomUUID();
    await org.scope
      .insertInto("projects", {
        id: projectId,
        name: name(body, "name", 100),
        created_by: org.session.user.id,
        created_at: now.toISOString(),
        updated_at: now.toISOString(),
      })
      .execute();
    await audit(db, now, {
      orgId: org.orgId,
      actorId: org.session.user.id,
      action: "project.created",
      targetType: "project",
      targetId: projectId,
    });
    return c.json(view(await find(org, projectId)), 201);
  });

  routes.patch("/projects/:id", async (c) => {
    const org = await requireOrg(deps, c, "write");
    const project = await find(org, id(c.req.param("id")));
    const body = await jsonBody(c);
    await org.scope
      .updateTable("projects")
      .set({
        name: name(body, "name", 100),
        updated_at: deps.now().toISOString(),
      })
      .where("id", "=", project.id)
      .execute();
    return c.json(view(await find(org, project.id)));
  });

  /** The project goes; its scripts stay, outside any project. */
  routes.delete("/projects/:id", async (c) => {
    const org = await requireOrg(deps, c, "write");
    const project = await find(org, id(c.req.param("id")));
    await db.transaction().execute(async (trx) => {
      const scope = scoped(trx, org.orgId);
      await scope
        .updateTable("scripts")
        .set({ project_id: null })
        .where("project_id", "=", project.id)
        .execute();
      await scope.deleteFrom("projects").where("id", "=", project.id).execute();
    });
    await audit(db, deps.now(), {
      orgId: org.orgId,
      actorId: org.session.user.id,
      action: "project.deleted",
      targetType: "project",
      targetId: project.id,
      detail: { name: project.name },
    });
    return c.json({ ok: true });
  });

  return routes;
}
