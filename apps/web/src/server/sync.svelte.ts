import type { ChangeSpec } from "@codemirror/state";
import type { ViewUpdate } from "@codemirror/view";
import * as Y from "yjs";
import { ApiFailure, request } from "./api.ts";

/**
 * Keeps a script on the server (ARCHITECTURE.md, Requests and sync). The
 * editor's changes go into a Yjs document as they happen; its updates are
 * sent in batches, about once a second while typing, and straight away
 * when the editor loses focus or the page is hidden. Each answer carries
 * any changes made elsewhere (another tab, a restored snapshot), which are
 * applied to the editor.
 *
 * Version 1 has no offline editing: when a save fails, editing pauses
 * until it succeeds (DESIGN.md, States). Nothing typed is thrown away.
 */

export const TEXT_NAME = "fountain";
const BATCH_MS = 1000;
/** Waits between retries after a failed save. */
const RETRY_MS = [1000, 2000, 5000];
/** Browsers cap keepalive request bodies at 64 KB. */
const KEEPALIVE_MAX = 60_000;

export type SyncState =
  | "saved"
  | "saving"
  /** No connection; retrying. Editing is paused. */
  | "offline"
  /** The server refused or failed; retrying. Editing is paused. */
  | "failing"
  /** The session ended. Editing is paused until the writer signs in again. */
  | "signedOut"
  /** The script was deleted elsewhere. */
  | "gone"
  /** The writer's role no longer allows writing. */
  | "readOnly";

export interface SyncStatus {
  state: SyncState;
  /** The last failure, for the notice bar. */
  failure: ApiFailure | null;
  /** When the server last confirmed a save. */
  savedAt: string | null;
}

/** Changes from Yjs's delta format to CodeMirror's, in original positions. */
export function deltaToChanges(
  delta: readonly {
    insert?: unknown;
    delete?: number | undefined;
    retain?: number | undefined;
  }[],
): ChangeSpec[] {
  const changes: ChangeSpec[] = [];
  let pos = 0;
  for (const op of delta) {
    if (typeof op.insert === "string")
      changes.push({ from: pos, insert: op.insert });
    else if (op.delete !== undefined) {
      changes.push({ from: pos, to: pos + op.delete });
      pos += op.delete;
    } else if (op.retain !== undefined) pos += op.retain;
  }
  return changes;
}

/** The sync request body: update length, update, state vector. */
export function syncBody(update: Uint8Array, vector: Uint8Array): Uint8Array {
  const body = new Uint8Array(4 + update.length + vector.length);
  new DataView(body.buffer).setUint32(0, update.length);
  body.set(update, 4);
  body.set(vector, 4 + update.length);
  return body;
}

export interface ScriptSync {
  readonly status: SyncStatus;
  text(): string;
  /** Mirrors an editor change into the Yjs document. */
  localChange(update: ViewUpdate): void;
  /** Sends what's pending now; resolves true once the server has it. */
  flush(options?: { keepalive?: boolean }): Promise<boolean>;
  /** True while something typed hasn't reached the server. */
  unsaved(): boolean;
  /** Try again now (after signing in again, or coming back online). */
  retry(): void;
  close(): void;
}

const LOCAL = Symbol("local");
const SERVER = Symbol("server");

export function openSync(
  scriptId: string,
  initialState: Uint8Array,
  applyRemote: (changes: ChangeSpec[]) => void,
): ScriptSync {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, initialState, SERVER);
  const ytext = doc.getText(TEXT_NAME);
  const status = $state<SyncStatus>({
    state: "saved",
    failure: null,
    savedAt: null,
  });

  let pending: Uint8Array[] = [];
  let inFlight: Promise<boolean> | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let failures = 0;
  let closed = false;

  doc.on("update", (update: Uint8Array, origin: unknown) => {
    if (origin !== LOCAL) return;
    pending.push(update);
    if (status.state === "saved") status.state = "saving";
    schedule(BATCH_MS);
  });

  ytext.observe((event, transaction) => {
    if (transaction.origin === LOCAL) return;
    applyRemote(deltaToChanges(event.delta));
  });

  function schedule(ms: number): void {
    if (timer !== null || closed) return;
    timer = setTimeout(() => {
      timer = null;
      void flush();
    }, ms);
  }

  function fail(error: unknown): void {
    const failure =
      error instanceof ApiFailure
        ? error
        : new ApiFailure(0, "unreachable", {});
    status.failure = failure;
    if (failure.status === 401) status.state = "signedOut";
    else if (failure.status === 404) status.state = "gone";
    else if (failure.code === "not_allowed") status.state = "readOnly";
    else {
      status.state =
        failure.code === "offline" || failure.code === "unreachable"
          ? "offline"
          : "failing";
      const wait = RETRY_MS[Math.min(failures, RETRY_MS.length - 1)] ?? 5000;
      failures += 1;
      schedule(wait);
    }
  }

  async function send(keepalive: boolean): Promise<boolean> {
    const batch = pending;
    pending = [];
    const update = Y.mergeUpdates(batch);
    const body = syncBody(update, Y.encodeStateVector(doc));
    try {
      const res = await request(
        "POST",
        `/scripts/${scriptId}/sync`,
        undefined,
        {
          raw: body as Uint8Array<ArrayBuffer>,
          keepalive: keepalive && body.length < KEEPALIVE_MAX,
        },
      );
      const missing = new Uint8Array(await res.arrayBuffer());
      if (missing.length > 0) Y.applyUpdate(doc, missing, SERVER);
      failures = 0;
      status.failure = null;
      status.savedAt = res.headers.get("x-pagework-updated");
      status.state = pending.length > 0 ? "saving" : "saved";
      if (pending.length > 0) schedule(BATCH_MS);
      return true;
    } catch (error) {
      // Put the batch back in front of anything typed since.
      pending = [...batch, ...pending];
      fail(error);
      return false;
    }
  }

  async function flush(
    options: { keepalive?: boolean } = {},
  ): Promise<boolean> {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    if (inFlight !== null) {
      const ok = await inFlight;
      if (!ok || pending.length === 0) return ok;
    }
    if (pending.length === 0) return true;
    inFlight = send(options.keepalive === true);
    try {
      return await inFlight;
    } finally {
      inFlight = null;
    }
  }

  const online = (): void => {
    if (status.state === "offline") void flush();
  };
  window.addEventListener("online", online);

  return {
    status,
    text: () => ytext.toJSON(),
    localChange(update) {
      doc.transact(() => {
        let shift = 0;
        update.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
          const text = inserted.sliceString(0, inserted.length, "\n");
          if (toA > fromA) ytext.delete(fromA + shift, toA - fromA);
          if (text.length > 0) ytext.insert(fromA + shift, text);
          shift += text.length - (toA - fromA);
        });
      }, LOCAL);
    },
    flush,
    unsaved: () => pending.length > 0 || inFlight !== null,
    retry() {
      failures = 0;
      void flush();
    },
    close() {
      closed = true;
      if (timer !== null) clearTimeout(timer);
      window.removeEventListener("online", online);
      doc.destroy();
    },
  };
}
