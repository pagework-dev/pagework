import type {
  DeleteQueryBuilder,
  DeleteResult,
  InsertObject,
  InsertQueryBuilder,
  InsertResult,
  Kysely,
  SelectQueryBuilder,
  UpdateQueryBuilder,
  UpdateResult,
} from "kysely";
import type { ContentTable, Database } from "./db/schema.ts";

/**
 * The one way to reach an organisation's content (ADR 0008). Every query
 * built here is limited to one organisation: reads, changes and deletes
 * filter on org_id, and inserts have org_id set from the scope, never from
 * the request. test/scope.test.ts fails if any other file queries a
 * content table directly.
 *
 * Joins between content tables also compare org_id in the join condition
 * (`onRef("b.org_id", "=", "a.org_id")`), so a wrong foreign key can't
 * bring in another organisation's rows.
 */
export interface OrgScope {
  readonly orgId: string;
  selectFrom<T extends ContentTable>(
    table: T,
  ): SelectQueryBuilder<Database, T, object>;
  insertInto<T extends ContentTable>(
    table: T,
    values:
      | Omit<InsertObject<Database, T>, "org_id">
      | readonly Omit<InsertObject<Database, T>, "org_id">[],
  ): InsertQueryBuilder<Database, T, InsertResult>;
  updateTable<T extends ContentTable>(
    table: T,
  ): UpdateQueryBuilder<Database, T, T, UpdateResult>;
  deleteFrom<T extends ContentTable>(
    table: T,
  ): DeleteQueryBuilder<Database, T, DeleteResult>;
}

// Kysely can't type a column reference built from a generic table name, so
// the builders are narrowed to the union of content tables (all of which
// have org_id), filtered, and handed back with the caller's table type.
type AnySelect = SelectQueryBuilder<Database, ContentTable, object>;
type AnyUpdate = UpdateQueryBuilder<
  Database,
  ContentTable,
  ContentTable,
  UpdateResult
>;
type AnyDelete = DeleteQueryBuilder<Database, ContentTable, DeleteResult>;

export function scoped(db: Kysely<Database>, orgId: string): OrgScope {
  if (orgId === "") throw new Error("An organisation scope needs an org id");
  const scope = {
    orgId,
    selectFrom(table: ContentTable): AnySelect {
      return (db.selectFrom(table) as unknown as AnySelect).where(
        `${table}.org_id` as "projects.org_id",
        "=",
        orgId,
      );
    },
    insertInto(table: ContentTable, values: object | readonly object[]) {
      const rows = (Array.isArray(values) ? values : [values]).map(
        (row: object) => ({ ...row, org_id: orgId }),
      ) as unknown as InsertObject<Database, ContentTable>[];
      return db.insertInto(table).values(rows);
    },
    updateTable(table: ContentTable): AnyUpdate {
      return db.updateTable(table).where("org_id", "=", orgId);
    },
    deleteFrom(table: ContentTable): AnyDelete {
      return db.deleteFrom(table).where("org_id", "=", orgId);
    },
  };
  return scope as unknown as OrgScope;
}
