import { sql } from "kysely";
import { Hono } from "hono";
import type { AppEnv, Deps } from "../context.ts";

export const VERSION = process.env.PAGEWORK_VERSION ?? "development";

/** For the container healthcheck and for the web app to find the server. */
export function healthRoutes(deps: Deps): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  routes.get("/health", async (c) => {
    try {
      await sql`select 1`.execute(deps.store.db);
      return c.json({ status: "ok" });
    } catch (error) {
      deps.log.error("Health check: the database didn't answer", { error });
      return c.json({ status: "unavailable" }, 503);
    }
  });

  // The web app asks this first. A static host (the standalone deployment)
  // has no such address, so the app knows to work without an account.
  routes.get("/instance", (c) =>
    c.json({ app: "pagework", mode: deps.config.mode, version: VERSION }),
  );

  return routes;
}
