import { join } from "node:path";
import { serve } from "@hono/node-server";
import { createApp } from "./app.ts";
import { openSetupGate } from "./auth/setup.ts";
import { ConfigError, loadConfig } from "./config.ts";
import { openStore } from "./db/index.ts";
import { migrate } from "./db/migrate.ts";
import { createLogger } from "./log.ts";
import { VERSION } from "./routes/health.ts";
import { loadTemplates } from "./templates.ts";
import { webApp } from "./web.ts";

async function main(): Promise<void> {
  let config;
  try {
    config = loadConfig();
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error;
    process.stderr.write(
      `Pagework can't start. Fix these settings (docs/CONFIGURATION.md):\n${error.message}\n`,
    );
    process.exit(78); // EX_CONFIG
  }
  const log = createLogger(config.logLevel);
  log.info("Starting Pagework", {
    version: VERSION,
    mode: config.mode,
    url: config.url.origin,
    database: config.database.kind,
  });
  if (config.insecureHttp)
    log.warn(
      "PAGEWORK_INSECURE_HTTP is on: passwords and sessions cross the network unencrypted.",
    );

  const store = openStore(config.database);
  await migrate(store, { backupDir: join(config.dataDir, "backups"), log });

  const web = webApp(config.webDir);
  if (!web.available)
    log.warn("The web app isn't built; only the API is served", {
      folder: config.webDir,
    });

  const setup = await openSetupGate(store.db, config.setupCode);
  const code = setup.code();
  if (code !== null && config.setupCode === undefined)
    // Deliberately printed: only the person running the server sees the
    // log, and the code is useless once the first account exists.
    log.info(
      `Pagework isn't set up yet. Open ${config.url.origin}/?setup=${code} to create the first account, or type the setup code ${code} there.`,
    );
  else if (code !== null)
    log.info(
      `Pagework isn't set up yet. Open ${config.url.origin} and use the setup code from PAGEWORK_SETUP_CODE.`,
    );

  const app = createApp({
    config,
    store,
    log,
    web,
    setup,
    templates: loadTemplates(),
    now: () => new Date(),
  });
  const server = serve(
    { fetch: app.fetch, hostname: config.host, port: config.port },
    (info) => {
      log.info("Listening", { address: info.address, port: info.port });
    },
  );

  const stop = (signal: string): void => {
    log.info("Stopping", { signal });
    server.close(() => {
      void store.close().then(() => process.exit(0));
    });
    // Open keep-alive connections shouldn't hold the container up.
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.once("SIGTERM", () => {
    stop("SIGTERM");
  });
  process.once("SIGINT", () => {
    stop("SIGINT");
  });
}

await main();
