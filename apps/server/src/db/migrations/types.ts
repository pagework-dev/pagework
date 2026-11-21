import { PostgresAdapter, type Kysely } from "kysely";

/**
 * A numbered migration (ADR 0006). Migrations never change after they are
 * released: a later change gets a new file. Each runs in a transaction.
 */
export interface Migration {
  // Migrations see the database as it was then, not as schema.ts says.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  up(db: Kysely<any>): Promise<void>;
}

/** Column type for binary data on the database in use. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function binary(db: Kysely<any>): "bytea" | "blob" {
  return db.getExecutor().adapter instanceof PostgresAdapter ? "bytea" : "blob";
}
