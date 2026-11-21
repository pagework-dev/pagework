import type { Config } from "./config.ts";
import type { Store } from "./db/index.ts";
import type { Logger } from "./log.ts";
import type { WebApp } from "./web.ts";

/** What every route can reach. Built once at start-up, or per test. */
export interface Deps {
  config: Config;
  store: Store;
  log: Logger;
  web: WebApp;
  /** The clock, replaceable in tests. */
  now: () => Date;
}

export interface AppEnv {
  Variables: Record<string, never>;
}
