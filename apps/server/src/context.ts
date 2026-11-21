import type { Session } from "./auth/sessions.ts";
import type { SetupGate } from "./auth/setup.ts";
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
  /** First-run setup: the code that lets the first account be created. */
  setup: SetupGate;
}

export interface AppEnv {
  Variables: {
    /** The signed-in session, or null (set for every /api request). */
    session: Session | null;
  };
}
