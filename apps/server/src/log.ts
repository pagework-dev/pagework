/**
 * One JSON object per line on stdout, for `docker logs` and log collectors.
 *
 * Nothing secret is ever logged: request bodies, cookies, headers and script
 * text are never passed in, and any field whose name looks like a secret is
 * replaced before writing, as a second line of defence.
 */

export type Level = "debug" | "info" | "warn" | "error";

export type Fields = Record<string, unknown>;

export interface Logger {
  debug(message: string, fields?: Fields): void;
  info(message: string, fields?: Fields): void;
  warn(message: string, fields?: Fields): void;
  error(message: string, fields?: Fields): void;
}

const ORDER: Record<Level, number> = { debug: 0, info: 1, warn: 2, error: 3 };

const SECRET_NAME =
  /pass(word)?|secret|token|cookie|authori[sz]ation|session|csrf|hash|key|text|state|body/i;

export const REDACTED = "[redacted]";

/** Replaces values of secret-looking fields, at any depth. */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 4) return REDACTED;
  if (value instanceof Error)
    return { name: value.name, message: value.message };
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (typeof value === "object" && value !== null) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value))
      out[k] = SECRET_NAME.test(k) ? REDACTED : redact(v, depth + 1);
    return out;
  }
  return value;
}

export function createLogger(
  level: Level,
  write: (line: string) => void = (line) => {
    process.stdout.write(`${line}\n`);
  },
): Logger {
  const emit =
    (at: Level) =>
    (message: string, fields: Fields = {}): void => {
      if (ORDER[at] < ORDER[level]) return;
      write(
        JSON.stringify({
          time: new Date().toISOString(),
          level: at,
          message,
          ...(redact(fields) as Fields),
        }),
      );
    };
  return {
    debug: emit("debug"),
    info: emit("info"),
    warn: emit("warn"),
    error: emit("error"),
  };
}

/** For tests: keeps lines in memory. */
export function memoryLogger(): Logger & { lines: Fields[] } {
  const lines: Fields[] = [];
  const logger = createLogger("debug", (line) => {
    lines.push(JSON.parse(line) as Fields);
  });
  return Object.assign(logger, { lines });
}
