/**
 * The typed element list the parser produces. Layout, PDF and the editor all
 * consume this shape, so it models screenwriting concepts, not Fountain syntax:
 * forcing markers, emphasis markers, notes and boneyard text are already gone
 * from `content`.
 */

/** A run of text with one combination of emphasis. Line breaks appear as "\n". */
export interface Span {
  text: string;
  bold?: true;
  italic?: true;
  underline?: true;
}

/** First and last source line of an element, 1-based and inclusive. */
export type LineRange = [first: number, last: number];

interface ElementBase {
  lines: LineRange;
  /** Inline `[[notes]]` removed from this element's text, in order. */
  notes?: string[];
}

export interface TitleField {
  /** As written, e.g. "Draft date". */
  key: string;
  content: Span[];
}

export interface TitlePage extends ElementBase {
  type: "title_page";
  fields: TitleField[];
}

export interface SceneHeading extends ElementBase {
  type: "scene_heading";
  content: Span[];
  /** From a trailing `#...#`, without the hashes. */
  sceneNumber: string | null;
  forced: boolean;
}

export interface Action extends ElementBase {
  type: "action";
  content: Span[];
  /** True when the paragraph's first line was forced with `!`. */
  forced: boolean;
}

export interface Character extends ElementBase {
  type: "character";
  /** The cue without extensions, as written (case is the template's job). */
  name: string;
  /** Text of each parenthesised extension, without the parentheses, e.g. "V.O.". */
  extensions: string[];
  /**
   * Dual dialogue side. The writer marks only the second cue (`^`); the parser
   * marks the cue it pairs with as "left". An unpaired `^` gives null.
   */
  dual: "left" | "right" | null;
  forced: boolean;
}

export interface Dialogue extends ElementBase {
  type: "dialogue";
  content: Span[];
}

export interface Parenthetical extends ElementBase {
  type: "parenthetical";
  /** Includes the parentheses, as written. */
  content: Span[];
}

export interface Lyrics extends ElementBase {
  type: "lyrics";
  content: Span[];
}

export interface Transition extends ElementBase {
  type: "transition";
  content: Span[];
  forced: boolean;
}

export interface Centered extends ElementBase {
  type: "centered";
  content: Span[];
}

export interface PageBreak extends ElementBase {
  type: "page_break";
}

export interface Section extends ElementBase {
  type: "section";
  /** Number of `#` characters. */
  depth: number;
  text: string;
}

export interface Synopsis extends ElementBase {
  type: "synopsis";
  text: string;
}

/** A note on lines of its own. Notes inside other text go in `notes`. */
export interface Note extends ElementBase {
  type: "note";
  text: string;
}

/** Boneyard text on lines of its own. Inline boneyard text is dropped. */
export interface Boneyard extends ElementBase {
  type: "boneyard";
  text: string;
}

export type Element =
  | TitlePage
  | SceneHeading
  | Action
  | Character
  | Dialogue
  | Parenthetical
  | Lyrics
  | Transition
  | Centered
  | PageBreak
  | Section
  | Synopsis
  | Note
  | Boneyard;

export type ElementType = Element["type"];
