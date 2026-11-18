import type { SceneEntry } from "./scenes.ts";
import { defaultTemplateId } from "./templates.ts";
import type { LineKind } from "../editor/lines.ts";
import type { Layout } from "../editor/view.ts";

export interface Session {
  templateId: string;
  scenes: SceneEntry[];
  /** Null until pages have been counted. */
  pageCount: number | null;
  /** Page the cursor is on; 0 on the title page. */
  currentPage: number | null;
  currentKind: LineKind;
  currentScene: SceneEntry | null;
  /** On narrow screens the navigator is a sheet. */
  navigatorOpen: boolean;
  layout: Layout;
  /** "Show Fountain": edit the raw text. */
  showFountain: boolean;
  /** The script has the keyboard focus (the touch element bar shows then). */
  editorFocused: boolean;
}

/** Phones default to reflow, tablets and desktops to pages (DESIGN.md, Layout). */
export const PHONE_WIDTH = 600;

const LAYOUT_KEY = "pagework.layout";

function storedLayout(): Layout | null {
  try {
    const value = localStorage.getItem(LAYOUT_KEY);
    return value === "page" || value === "reflow" ? value : null;
  } catch {
    return null;
  }
}

/** Remembers the writer's view on this device; losing it costs nothing. */
export function rememberLayout(layout: Layout): void {
  try {
    localStorage.setItem(LAYOUT_KEY, layout);
  } catch {
    // Storage refused (private window): the default comes back next time.
  }
}

/**
 * What the chrome around the editor shows. The editor writes to it; the
 * toolbar, navigator and status bar read it.
 */
export const session = $state<Session>({
  templateId: defaultTemplateId(navigator.language),
  scenes: [],
  pageCount: null,
  currentPage: null,
  currentKind: "blank",
  currentScene: null,
  navigatorOpen: false,
  layout:
    storedLayout() ?? (window.innerWidth < PHONE_WIDTH ? "reflow" : "page"),
  showFountain: false,
  editorFocused: false,
});
