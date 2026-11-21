import { Hono } from "hono";
import type { AppEnv, Deps } from "./context.ts";
import { ApiError } from "./errors.ts";
import { healthRoutes } from "./routes/health.ts";

/** The whole HTTP surface: the API under /api, the web app everywhere else. */
export function createApp(deps: Deps): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  const { log, web } = deps;

  app.use(async (c, next) => {
    const started = performance.now();
    await next();
    for (const [name, value] of Object.entries(web.securityHeaders))
      if (!c.res.headers.has(name)) c.res.headers.set(name, value);
    // Only the path: query strings can hold single-use links.
    log.debug("Request", {
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      ms: Math.round(performance.now() - started),
    });
  });

  const api = new Hono<AppEnv>();
  api.use(async (c, next) => {
    await next();
    c.res.headers.set("Cache-Control", "no-store");
  });
  api.route("/", healthRoutes(deps));
  api.all("*", (c) => c.json({ error: "not_found" }, 404));
  app.route("/api", api);

  app.get("*", (c) => {
    const file = web.file(c.req.path);
    return c.body(
      file.body as Uint8Array<ArrayBuffer>,
      file.status,
      file.headers,
    );
  });

  app.onError((error, c) => {
    if (error instanceof ApiError)
      return c.json({ error: error.code, ...error.detail }, error.status);
    log.error("Request failed", {
      method: c.req.method,
      path: c.req.path,
      error,
    });
    return c.json({ error: "internal" }, 500);
  });

  return app;
}
