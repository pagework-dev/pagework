export type FileAction = "new" | "open" | "save" | "saveAs" | "print";

/**
 * File shortcuts. Ctrl/Cmd+P prints the PDF rather than the page on screen,
 * so printed pages match exported ones (ARCHITECTURE.md). Ctrl/Cmd+N is
 * kept by browsers for a new window, so a new script is Ctrl/Cmd+Alt+N.
 */
export function fileShortcut(event: {
  key: string;
  /** The physical key: Alt changes `key` on a Mac (Alt+N types a dead key). */
  code: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}): FileAction | null {
  const mod = event.ctrlKey || event.metaKey;
  if (!mod) return null;
  const key = event.key.toLowerCase();
  if (key === "s") return event.shiftKey ? "saveAs" : "save";
  if (key === "o" && !event.shiftKey) return "open";
  if (key === "p" && !event.shiftKey) return "print";
  if (event.code === "KeyN" && event.altKey) return "new";
  return null;
}
