import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createLogger, redact, REDACTED } from "../src/log.ts";
import { headersFor, parseHeadersFile } from "../src/web.ts";
import { tempDir, testServer } from "./helpers.ts";

let cleanup: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const c of cleanup) await c();
  cleanup = [];
});

const HEADERS = `# Written by apps/web/build/headers.ts when the app is built.
/*
  Content-Security-Policy: default-src 'self'
  X-Frame-Options: DENY

/assets/*
  Cache-Control: public, max-age=31536000, immutable

/index.html
  Cache-Control: no-cache
`;

function builtWebApp(): string {
  const dir = tempDir();
  cleanup.push(dir.remove);
  mkdirSync(join(dir.path, "assets"));
  writeFileSync(
    join(dir.path, "index.html"),
    "<!doctype html><head><title>app</title></head>",
  );
  writeFileSync(join(dir.path, "assets", "main-abc.js"), "console.log(1)");
  writeFileSync(join(dir.path, "_headers"), HEADERS);
  return dir.path;
}

async function server(webDir?: string) {
  const s = await testServer({}, webDir);
  cleanup.push(s.close);
  return s;
}

describe("API basics", () => {
  it("reports health", async () => {
    const s = await server();
    const res = await s.fetch("/api/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("says what it is, so the web app knows there is a server", async () => {
    const s = await server();
    const body = (await (await s.fetch("/api/instance")).json()) as Record<
      string,
      unknown
    >;
    expect(body.app).toBe("pagework");
    expect(body.mode).toBe("personal");
  });

  it("answers unknown API addresses with JSON, not the app", async () => {
    const s = await server(builtWebApp());
    const res = await s.fetch("/api/nothing-here");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
  });
});

describe("the web app", () => {
  it("is served with the build's security headers", async () => {
    const s = await server(builtWebApp());
    const res = await s.fetch("/");
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("<title>app</title>");
    expect(res.headers.get("content-security-policy")).toBe(
      "default-src 'self'",
    );
    expect(res.headers.get("cache-control")).toBe("no-cache");
    // The API carries the same security headers.
    const api = await s.fetch("/api/health");
    expect(api.headers.get("x-frame-options")).toBe("DENY");
  });

  it("marks the page it serves, so the app knows a server is there", async () => {
    const s = await server(builtWebApp());
    for (const path of ["/", "/index.html", "/scripts/123"])
      expect(await (await s.fetch(path)).text(), path).toContain(
        '<meta name="pagework-server" content="1">',
      );
  });

  it("caches hashed assets for a year", async () => {
    const s = await server(builtWebApp());
    const res = await s.fetch("/assets/main-abc.js");
    expect(res.headers.get("content-type")).toContain("text/javascript");
    expect(res.headers.get("cache-control")).toContain("immutable");
  });

  it("serves the app for addresses inside it", async () => {
    const s = await server(builtWebApp());
    const res = await s.fetch("/scripts/123");
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("<title>app</title>");
  });

  it("serves nothing outside its folder, nor the headers file", async () => {
    const s = await server(builtWebApp());
    for (const path of ["/_headers", "/missing.js", "/assets/../_headers"])
      expect((await s.fetch(path)).status, path).toBe(404);
    // Dot segments are resolved before routing, so whatever is served
    // comes from the web folder.
    for (const path of [
      "/../../etc/passwd",
      "/%2e%2e/%2e%2e/etc/passwd",
      "/assets/..%2f..%2f..%2fetc%2fpasswd",
    ]) {
      const text = await (await s.fetch(path)).text();
      expect(text, path).not.toContain("root:");
    }
  });

  it("parses the headers file", () => {
    const rules = parseHeadersFile(HEADERS);
    expect(headersFor(rules, "/assets/x.js")).toEqual({
      "Content-Security-Policy": "default-src 'self'",
      "X-Frame-Options": "DENY",
      "Cache-Control": "public, max-age=31536000, immutable",
    });
  });
});

describe("logging", () => {
  it("never writes secret-looking fields", () => {
    expect(
      redact({
        path: "/api/x",
        password: "hunter2",
        nested: { sessionToken: "abc", count: 2 },
        headers: [{ cookie: "s=1" }],
      }),
    ).toEqual({
      path: "/api/x",
      password: REDACTED,
      nested: { sessionToken: REDACTED, count: 2 },
      headers: [{ cookie: REDACTED }],
    });
  });

  it("writes one JSON object per line, at or above its level", () => {
    const lines: string[] = [];
    const log = createLogger("info", (l) => lines.push(l));
    log.debug("hidden");
    log.info("shown", { secret: "s" });
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0] ?? "")).toMatchObject({
      level: "info",
      message: "shown",
      secret: REDACTED,
    });
  });
});
