import type { SceneEntry } from "./scenes.ts";
import { defaultTemplateId } from "./templates.ts";
import type { LineKind } from "../editor/lines.ts";

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
});
