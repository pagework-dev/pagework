import { isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Server configuration, from environment variables only (ARCHITECTURE.md,
 * Configuration). Every variable is documented in docs/CONFIGURATION.md;
 * a test checks that the two stay in step.
 */

export type Mode = "personal" | "team" | "hosted";

export type DatabaseConfig =
  { kind: "sqlite"; file: string } | { kind: "postgres"; url: string };

export interface Config {
  mode: Mode;
  /** Keys the hashes of session and reset tokens. Never logged. */
  secret: string;
  /** The address people use to reach the server, without a trailing slash. */
  url: URL;
  database: DatabaseConfig;
  dataDir: string;
  host: string;
  port: number;
  /** The built web app (apps/web/dist). */
  webDir: string;
  /** Trust X-Forwarded-For from a reverse proxy for rate limiting. */
  trustProxy: boolean;
  /** Allow a plain-http PAGEWORK_URL on a host other than localhost. */
  insecureHttp: boolean;
  logLevel: "debug" | "info" | "warn" | "error";
}

export class ConfigError extends Error {}

const MODES: readonly Mode[] = ["personal", "team", "hosted"];
const LOG_LEVELS = ["debug", "info", "warn", "error"] as const;
/** 32 bytes of hex or base64 is at least 43 characters. */
const MIN_SECRET_LENGTH = 32;

const DEFAULT_WEB_DIR = fileURLToPath(
  new URL("../../web/dist", import.meta.url),
);

type Env = Record<string, string | undefined>;

/** A variable's value, or undefined when it is unset or blank. */
function setting(env: Env, name: string): string | undefined {
  const value = env[name]?.trim();
  return value === undefined || value === "" ? undefined : value;
}

function required(env: Env, name: string, problems: string[]): string {
  const value = env[name]?.trim() ?? "";
  if (value === "") problems.push(`${name} is not set.`);
  return value;
}

function flag(env: Env, name: string, problems: string[]): boolean {
  const value = env[name]?.trim().toLowerCase() ?? "";
  if (value === "" || value === "false" || value === "0") return false;
  if (value === "true" || value === "1") return true;
  problems.push(`${name} must be true or false, not "${value}".`);
  return false;
}

function isLocalhost(url: URL): boolean {
  return ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
}

export function databaseFromUrl(
  value: string | undefined,
  dataDir: string,
): DatabaseConfig {
  const raw = value?.trim() ?? "";
  if (raw === "") return { kind: "sqlite", file: join(dataDir, "pagework.db") };
  if (/^postgres(ql)?:\/\//i.test(raw)) return { kind: "postgres", url: raw };
  const match = /^(?:sqlite|file):(.+)$/i.exec(raw);
  if (match?.[1] !== undefined) {
    const path = match[1].replace(/^\/\/(?=\/)/, "");
    if (path === ":memory:") return { kind: "sqlite", file: path };
    return {
      kind: "sqlite",
      file: isAbsolute(path) ? path : resolve(dataDir, path),
    };
  }
  throw new ConfigError(
    "DATABASE_URL must start with postgres://, postgresql://, sqlite: or file:.",
  );
}

/** Reads and checks the configuration; throws ConfigError listing every problem at once. */
export function loadConfig(env: Env = process.env): Config {
  const problems: string[] = [];

  const modeText = required(env, "PAGEWORK_MODE", problems).toLowerCase();
  const mode = MODES.find((m) => m === modeText);
  if (modeText !== "" && mode === undefined)
    problems.push(
      `PAGEWORK_MODE must be personal, team or hosted, not "${modeText}".`,
    );

  const secret = required(env, "PAGEWORK_SECRET", problems);
  if (secret !== "" && secret.length < MIN_SECRET_LENGTH)
    problems.push(
      `PAGEWORK_SECRET must be at least ${String(MIN_SECRET_LENGTH)} characters. Make one with: openssl rand -hex 32`,
    );

  const urlText = required(env, "PAGEWORK_URL", problems);
  let url: URL | null = null;
  if (urlText !== "") {
    try {
      url = new URL(urlText);
      if (url.protocol !== "https:" && url.protocol !== "http:")
        problems.push("PAGEWORK_URL must start with https:// or http://.");
      if (url.pathname !== "/" || url.search !== "" || url.hash !== "")
        problems.push(
          "PAGEWORK_URL must be the address of the server only, with no path, such as https://scripts.example.com.",
        );
    } catch {
      problems.push(`PAGEWORK_URL "${urlText}" is not a web address.`);
    }
  }

  const insecureHttp = flag(env, "PAGEWORK_INSECURE_HTTP", problems);
  if (url?.protocol === "http:" && !isLocalhost(url) && !insecureHttp)
    problems.push(
      "PAGEWORK_URL uses http:// on a host other than localhost. Browsers won't keep the sign-in cookie, and passwords would cross the network unencrypted. Put the server behind HTTPS (docs/SELF-HOSTING.md), or set PAGEWORK_INSECURE_HTTP=true on a private network you trust.",
    );

  const dataDir = resolve(setting(env, "PAGEWORK_DATA_DIR") ?? "/data");

  let database: DatabaseConfig = { kind: "sqlite", file: "" };
  try {
    database = databaseFromUrl(env.DATABASE_URL, dataDir);
  } catch (error) {
    if (error instanceof ConfigError) problems.push(error.message);
    else throw error;
  }

  const portText = setting(env, "PORT") ?? "3000";
  const port = Number(portText);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    problems.push(`PORT must be a number from 1 to 65535, not "${portText}".`);

  const levelText = (
    setting(env, "PAGEWORK_LOG_LEVEL") ?? "info"
  ).toLowerCase();
  const logLevel = LOG_LEVELS.find((l) => l === levelText);
  if (logLevel === undefined)
    problems.push(
      `PAGEWORK_LOG_LEVEL must be debug, info, warn or error, not "${levelText}".`,
    );

  const trustProxy = flag(env, "PAGEWORK_TRUST_PROXY", problems);

  if (problems.length > 0 || mode === undefined || url === null)
    throw new ConfigError(problems.join("\n"));

  return {
    mode,
    secret,
    url: new URL(url.origin),
    database,
    dataDir,
    host: setting(env, "HOST") ?? "0.0.0.0",
    port,
    webDir: resolve(setting(env, "PAGEWORK_WEB_DIR") ?? DEFAULT_WEB_DIR),
    trustProxy,
    insecureHttp,
    logLevel: logLevel ?? "info",
  };
}

/** The public origin, as browsers send it in the Origin header. */
export function origin(config: Pick<Config, "url">): string {
  return config.url.origin;
}
