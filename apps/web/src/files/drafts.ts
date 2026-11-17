/**
 * The safety copy: the current script is written to the browser's own
 * storage (IndexedDB) as it changes, so a closed tab, a crash or a dead
 * battery loses nothing. It never leaves the browser (ADR 0010).
 */

export interface Draft {
  id: string;
  text: string;
  /** The file it was opened from or saved to, if any. */
  fileName: string | null;
  templateId: string;
  /** True when the text has changes not saved to a file. */
  unsaved: boolean;
  /** Milliseconds since 1970. */
  updatedAt: number;
}

export interface DraftStore {
  put(draft: Draft): Promise<void>;
  all(): Promise<Draft[]>;
  remove(id: string): Promise<void>;
}

/** Drafts kept; older ones are pruned when a draft is written. */
export const DRAFTS_KEPT = 10;

/** The draft to offer when the app opens: the newest with work that would otherwise be lost. */
export function draftToOffer(
  drafts: readonly Draft[],
  currentId: string,
): Draft | null {
  const candidates = drafts
    .filter((d) => d.id !== currentId && d.unsaved && d.text.trim() !== "")
    .sort((a, b) => b.updatedAt - a.updatedAt);
  return candidates[0] ?? null;
}

/** Drafts to delete so only the newest DRAFTS_KEPT remain. */
export function draftsToPrune(drafts: readonly Draft[]): string[] {
  return [...drafts]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(DRAFTS_KEPT)
    .map((d) => d.id);
}

const DB_NAME = "pagework";
const STORE = "drafts";

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => {
      resolve(req.result);
    };
    req.onerror = () => {
      reject(req.error ?? new Error("IndexedDB request failed"));
    };
  });
}

/** Drafts in IndexedDB. Rejects if the browser has no storage (some private windows). */
export async function indexedDbDrafts(): Promise<DraftStore> {
  const open = indexedDB.open(DB_NAME, 1);
  open.onupgradeneeded = () => {
    open.result.createObjectStore(STORE, { keyPath: "id" });
  };
  const db = await request(open);
  const run = async <T>(
    mode: IDBTransactionMode,
    action: (store: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> => {
    const tx = db.transaction(STORE, mode);
    const result = await request(action(tx.objectStore(STORE)));
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => {
        resolve();
      };
      tx.onerror = () => {
        reject(tx.error ?? new Error("IndexedDB transaction failed"));
      };
      tx.onabort = () => {
        reject(tx.error ?? new Error("IndexedDB transaction aborted"));
      };
    });
    return result;
  };
  return {
    async put(draft) {
      await run("readwrite", (s) => s.put(draft));
    },
    async all() {
      return (await run("readonly", (s) => s.getAll())) as Draft[];
    },
    async remove(id) {
      await run("readwrite", (s) => s.delete(id));
    },
  };
}

/** A store in memory, for tests and for browsers with no storage. */
export function memoryDrafts(): DraftStore {
  const drafts = new Map<string, Draft>();
  return {
    put(draft) {
      drafts.set(draft.id, { ...draft });
      return Promise.resolve();
    },
    all() {
      return Promise.resolve([...drafts.values()].map((d) => ({ ...d })));
    },
    remove(id) {
      drafts.delete(id);
      return Promise.resolve();
    },
  };
}

/**
 * Writes the draft a short pause after the last change, and straight away
 * when the page is hidden. A newer change replaces one not yet written.
 */
export function draftWriter(
  store: DraftStore,
  onResult: (ok: boolean) => void,
  delayMs = 250,
): {
  schedule: (draft: Draft | (() => Draft)) => void;
  flush: () => Promise<void>;
} {
  // A function is called only when the draft is written, so building the
  // draft (the whole script as text) stays off the keystroke path.
  let pending: Draft | (() => Draft) | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const flush = async (): Promise<void> => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    const next = pending;
    pending = null;
    if (next === null) return;
    const draft = typeof next === "function" ? next() : next;
    try {
      await store.put(draft);
      const old = draftsToPrune(await store.all());
      for (const id of old) await store.remove(id);
      onResult(true);
    } catch {
      onResult(false);
    }
  };
  return {
    schedule(draft) {
      pending = draft;
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => {
        void flush();
      }, delayMs);
    },
    flush,
  };
}
