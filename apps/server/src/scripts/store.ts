import type { Kysely } from "kysely";
import * as Y from "yjs";
import type { Database } from "../db/schema.ts";
import { ApiError, notFound } from "../errors.ts";
import { scoped } from "../scope.ts";
import { MAX_TEXT, merge, stateFromText, TEXT_NAME } from "./documents.ts";

export interface NewScript {
  title: string;
  templateId: string;
  projectId: string | null;
  ownerId: string;
  text: string;
  now: Date;
}

/** Creates a script and its first state; returns its id. */
export async function createScript(
  db: Kysely<Database>,
  orgId: string,
  script: NewScript,
): Promise<string> {
  if (script.text.length > MAX_TEXT) throw new ApiError(400, "script_too_long");
  const id = crypto.randomUUID();
  const at = script.now.toISOString();
  await db.transaction().execute(async (trx) => {
    const scope = scoped(trx, orgId);
    await scope
      .insertInto("scripts", {
        id,
        project_id: script.projectId,
        title: script.title,
        template_id: script.templateId,
        owner_id: script.ownerId,
        created_at: at,
        updated_at: at,
      })
      .execute();
    await scope
      .insertInto("script_state", {
        script_id: id,
        ydoc: stateFromText(script.text),
        fountain: script.text,
        version: 1,
        updated_at: at,
      })
      .execute();
  });
  return id;
}

export interface Saved {
  version: number;
  updatedAt: string;
  /** Changes the sender doesn't have, from other tabs or restores. */
  missing: Uint8Array | null;
  text: string;
}

async function save(
  db: Kysely<Database>,
  orgId: string,
  scriptId: string,
  change: (state: Uint8Array) => {
    state: Uint8Array;
    text: string;
    missing: Uint8Array | null;
  },
  now: Date,
): Promise<Saved> {
  return db.transaction().execute(async (trx) => {
    const scope = scoped(trx, orgId);
    const row = await scope
      .selectFrom("script_state")
      .select(["ydoc", "version"])
      .where("script_id", "=", scriptId)
      .executeTakeFirst();
    if (row === undefined) throw notFound();
    const next = change(row.ydoc);
    const at = now.toISOString();
    const version = row.version + 1;
    await scope
      .updateTable("script_state")
      .set({ ydoc: next.state, fountain: next.text, version, updated_at: at })
      .where("script_id", "=", scriptId)
      .execute();
    await scope
      .updateTable("scripts")
      .set({ updated_at: at })
      .where("id", "=", scriptId)
      .execute();
    return { version, updatedAt: at, missing: next.missing, text: next.text };
  });
}

/** Merges a Yjs update from the editor (ARCHITECTURE.md, Requests and sync). */
export function applyUpdate(
  db: Kysely<Database>,
  orgId: string,
  scriptId: string,
  update: Uint8Array,
  senderVector: Uint8Array | null,
  now: Date,
): Promise<Saved> {
  return save(
    db,
    orgId,
    scriptId,
    (state) => merge(state, update, senderVector),
    now,
  );
}

/**
 * Makes the script's text exactly `text` (restoring a snapshot, importing
 * into an existing script), as an ordinary edit: only the changed middle
 * is replaced, so an editor that is open merges it like any other change.
 */
export function replaceText(
  db: Kysely<Database>,
  orgId: string,
  scriptId: string,
  text: string,
  now: Date,
): Promise<Saved> {
  if (text.length > MAX_TEXT) throw new ApiError(400, "script_too_long");
  return save(
    db,
    orgId,
    scriptId,
    (state) => {
      const doc = new Y.Doc();
      try {
        Y.applyUpdate(doc, state);
        const ytext = doc.getText(TEXT_NAME);
        const old = ytext.toJSON();
        let start = 0;
        while (
          start < old.length &&
          start < text.length &&
          old[start] === text[start]
        )
          start++;
        let end = 0;
        while (
          end < old.length - start &&
          end < text.length - start &&
          old[old.length - 1 - end] === text[text.length - 1 - end]
        )
          end++;
        doc.transact(() => {
          ytext.delete(start, old.length - start - end);
          ytext.insert(start, text.slice(start, text.length - end));
        });
        return { state: Y.encodeStateAsUpdate(doc), text, missing: null };
      } finally {
        doc.destroy();
      }
    },
    now,
  );
}
