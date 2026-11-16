import type { Span } from "@pagework/fountain";

/** What a printed line is, for renderers and the editor's page view. */
export type LineRole =
  | "scene_heading"
  | "scene_number"
  | "action"
  | "character"
  | "parenthetical"
  | "dialogue"
  | "lyrics"
  | "transition"
  | "centered"
  | "more"
  | "page_number"
  | "title_page";

export interface PageLine {
  /** Distance from the left edge of the page to the start of the text, in points. */
  x: number;
  /** Distance from the top edge of the page to the top of the line, in points. */
  y: number;
  spans: Span[];
  role: LineRole;
}

export interface Page {
  kind: "title" | "script";
  /** Script page number, counting from 1 after the title page; null on the title page. */
  number: number | null;
  lines: PageLine[];
}

export interface PageModel {
  /** Page size in points. */
  width: number;
  height: number;
  font: { family: string; size: number; lineHeight: number };
  pages: Page[];
}
