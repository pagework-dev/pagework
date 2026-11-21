import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../src/app.ts";
import { loadConfig, type Config } from "../src/config.ts";
import type { Deps } from "../src/context.ts";
import { openStore } from "../src/db/index.ts";
import { migrate } from "../src/db/migrate.ts";
import { memoryLogger } from "../src/log.ts";
import { webApp } from "../src/web.ts";

export const SECRET = "test-secret-that-is-long-enough-0123456789";

export function testConfig(env: Record<string, string> = {}): Config {
  return loadConfig({
    PAGEWORK_MODE: "personal",
    PAGEWORK_SECRET: SECRET,
    PAGEWORK_URL: "http://localhost:3000",
    PAGEWORK_DATA_DIR: tmpdir(),
    DATABASE_URL: "sqlite::memory:",
    ...env,
  });
}

export function tempDir(): { path: string; remove: () => void } {
  const path = mkdtempSync(join(tmpdir(), "pagework-test-"));
  return {
    path,
    remove: () => {
      rmSync(path, { recursive: true, force: true });
    },
  };
}

/** A migrated in-memory server, and fetch that goes straight to it. */
export async function testServer(
  env: Record<string, string> = {},
  webDir = "/nonexistent",
) {
  const config = { ...testConfig(env), webDir };
  const store = openStore(config.database);
  const log = memoryLogger();
  await migrate(store, { backupDir: tempDir().path, log });
  let clock = new Date("2026-11-21T09:00:00.000Z");
  const deps: Deps = {
    config,
    store,
    log,
    web: webApp(webDir),
    now: () => clock,
  };
  const app = createApp(deps);
  return {
    app,
    deps,
    log,
    store,
    advance(ms: number) {
      clock = new Date(clock.getTime() + ms);
    },
    fetch: (path: string, init?: RequestInit) =>
      app.fetch(new Request(new URL(path, config.url), init)),
    close: () => store.close(),
  };
}
