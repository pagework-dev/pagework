import * as Y from "yjs";
import { ApiError, badRequest } from "../errors.ts";

/**
 * A script's content is a Yjs document holding one text type with the
 * Fountain source (ADR 0005). The editor sends Yjs updates; the server
 * merges them, stores the new state, and keeps a plain Fountain copy.
 */

/** The name of the shared text in every script's Yjs document. */
export const TEXT_NAME = "fountain";

/** Longest script text accepted, in characters: far beyond a 300-page script. */
export const MAX_TEXT = 5_000_000;

export function stateFromText(text: string): Uint8Array {
  const doc = new Y.Doc();
  if (text !== "") doc.getText(TEXT_NAME).insert(0, text);
  else doc.getText(TEXT_NAME);
  const state = Y.encodeStateAsUpdate(doc);
  doc.destroy();
  return state;
}

export function textOfState(state: Uint8Array): string {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, state);
  const text = doc.getText(TEXT_NAME).toJSON();
  doc.destroy();
  return text;
}

export interface Merged {
  /** The whole document after the update, compacted. */
  state: Uint8Array;
  text: string;
  /** What the sender doesn't have yet (other tabs' changes), if it said what it has. */
  missing: Uint8Array | null;
}

/**
 * Applies an update from the editor to the stored state. Re-encoding the
 * whole document each time also compacts it: Yjs drops the content of
 * deleted text, keeping only what it needs to merge.
 */
export function merge(
  state: Uint8Array,
  update: Uint8Array,
  senderVector: Uint8Array | null,
): Merged {
  const doc = new Y.Doc();
  try {
    Y.applyUpdate(doc, state);
    Y.applyUpdate(doc, update);
    const text = doc.getText(TEXT_NAME).toJSON();
    if (text.length > MAX_TEXT) throw badRequest("script_too_long");
    return {
      state: Y.encodeStateAsUpdate(doc),
      text,
      missing:
        senderVector === null ? null : Y.encodeStateAsUpdate(doc, senderVector),
    };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw badRequest("invalid_update");
  } finally {
    doc.destroy();
  }
}

/**
 * The body of a sync request: a 4-byte big-endian length, the update,
 * then the sender's state vector (may be empty).
 */
export function readSyncBody(body: Uint8Array): {
  update: Uint8Array;
  vector: Uint8Array | null;
} {
  if (body.length < 4) throw badRequest("invalid_update");
  const length = new DataView(
    body.buffer,
    body.byteOffset,
    body.byteLength,
  ).getUint32(0);
  if (length > body.length - 4) throw badRequest("invalid_update");
  const update = body.subarray(4, 4 + length);
  const rest = body.subarray(4 + length);
  return { update, vector: rest.length === 0 ? null : rest };
}
