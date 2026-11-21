/**
 * Whether the app was served by a Pagework server, and the choice to use it
 * without an account. Kept small and free of server code: local mode loads
 * this, and nothing else from the server side (CLAUDE.md, KEY DECISIONS).
 */

export interface Instance {
  app: "pagework";
  mode: "personal" | "team" | "hosted";
  version: string;
  setupRequired: boolean;
}

export const host = $state<{ server: Instance | null }>({ server: null });

const WITHOUT_ACCOUNT = "pagework.withoutAccount";

/**
 * A Pagework server marks the page it serves (apps/server/src/web.ts). A
 * static host, such as the standalone deployment, doesn't, so the app
 * opens in local mode at once and makes no request.
 */
export function servedByPagework(): boolean {
  return document.querySelector('meta[name="pagework-server"]') !== null;
}

/** Asks the server about itself: its mode, and whether it is set up yet. */
export async function findServer(): Promise<Instance | null> {
  if (!servedByPagework()) return null;
  try {
    const res = await fetch("/api/instance", {
      headers: { accept: "application/json" },
      credentials: "same-origin",
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok || !res.headers.get("content-type")?.includes("json"))
      return null;
    const body = (await res.json()) as Partial<Instance>;
    return body.app === "pagework" ? (body as Instance) : null;
  } catch {
    return null;
  }
}

export function chosenWithoutAccount(): boolean {
  try {
    return localStorage.getItem(WITHOUT_ACCOUNT) === "1";
  } catch {
    return false;
  }
}

/** Remembers, on this device, to open without an account. */
export function chooseWithoutAccount(choice: boolean): void {
  try {
    if (choice) localStorage.setItem(WITHOUT_ACCOUNT, "1");
    else localStorage.removeItem(WITHOUT_ACCOUNT);
  } catch {
    // Storage refused: the sign-in screen shows again next time.
  }
}
