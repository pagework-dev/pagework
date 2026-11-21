import * as Y from "yjs";

/** What the web app does: a Yjs document whose updates are sent in batches. */
export function editorDoc(state?: Uint8Array) {
  const doc = new Y.Doc();
  if (state !== undefined) Y.applyUpdate(doc, state);
  const text = doc.getText("fountain");
  let pending: Uint8Array[] = [];
  doc.on("update", (update: Uint8Array, origin: unknown) => {
    if (origin !== "server") pending.push(update);
  });
  return {
    doc,
    text,
    /** The sync request body: length, merged update, state vector. */
    body(): Uint8Array {
      const update = Y.mergeUpdates(pending);
      pending = [];
      const vector = Y.encodeStateVector(doc);
      const out = new Uint8Array(4 + update.length + vector.length);
      new DataView(out.buffer).setUint32(0, update.length);
      out.set(update, 4);
      out.set(vector, 4 + update.length);
      return out;
    },
    receive(missing: Uint8Array) {
      if (missing.length > 0) Y.applyUpdate(doc, missing, "server");
    },
  };
}
