import type { Kysely } from "kysely";
import type { Database } from "../db/schema.ts";
import { newCode, normaliseCode, sameToken } from "./tokens.ts";

/**
 * First-run setup. Until the first account exists, whoever reaches the
 * server first could claim it, and servers are often reachable from the
 * internet through a tunnel from the moment they start. So setup needs a
 * code that only the person running the server can see: printed in the
 * server's log at start-up, or chosen in advance with PAGEWORK_SETUP_CODE.
 * The code is useless once the first account exists.
 */
export interface SetupGate {
  /** The code, while setup is still to be done; null afterwards. */
  code(): string | null;
  matches(typed: string): boolean;
  done(): void;
}

export function setupGate(code: string | null): SetupGate {
  let current = code === null ? null : normaliseCode(code);
  return {
    code: () => current,
    matches(typed) {
      return current !== null && sameToken(normaliseCode(typed), current);
    },
    done() {
      current = null;
    },
  };
}

export async function setupRequired(db: Kysely<Database>): Promise<boolean> {
  const row = await db
    .selectFrom("users")
    .select("id")
    .limit(1)
    .executeTakeFirst();
  return row === undefined;
}

/** At start-up: a gate with a code if setup is still to be done. */
export async function openSetupGate(
  db: Kysely<Database>,
  configured: string | undefined,
): Promise<SetupGate> {
  if (!(await setupRequired(db))) return setupGate(null);
  return setupGate(
    configured !== undefined && configured.trim() !== ""
      ? configured
      : newCode(),
  );
}
