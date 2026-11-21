/**
 * Addresses inside the signed-in app. The server answers any of them with
 * the app, so a reload or a bookmark opens the same screen.
 */
export type Route =
  | { screen: "scripts" }
  | { screen: "script"; id: string }
  | { screen: "account" };

const SCRIPT = /^\/scripts\/([0-9a-f-]{36})\/?$/;

export function parseRoute(path: string): Route {
  const script = SCRIPT.exec(path);
  if (script?.[1] !== undefined) return { screen: "script", id: script[1] };
  if (path === "/account") return { screen: "account" };
  return { screen: "scripts" };
}

export function routePath(route: Route): string {
  switch (route.screen) {
    case "script":
      return `/scripts/${route.id}`;
    case "account":
      return "/account";
    case "scripts":
      return "/";
  }
}

export const router = $state<{ route: Route }>({
  route: parseRoute(location.pathname),
});

/** What the script list shows, kept while moving between screens. */
export const listView = $state<{ filter: string }>({ filter: "all" });

let leaving: (() => Promise<boolean>) | null = null;

/**
 * Lets the open screen finish first (the editor saves what's pending)
 * before going elsewhere. Returning false stays.
 */
export function beforeLeaving(check: (() => Promise<boolean>) | null): void {
  leaving = check;
}

export async function go(route: Route): Promise<void> {
  if (leaving !== null && !(await leaving())) return;
  history.pushState(null, "", routePath(route));
  router.route = route;
}

window.addEventListener("popstate", () => {
  router.route = parseRoute(location.pathname);
});
