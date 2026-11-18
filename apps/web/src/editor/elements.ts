import { inlineMarks, type StyledRange } from "@pagework/fountain";
import type { LineKind } from "./lines.ts";

/**
 * The elements a writer chooses (ARCHITECTURE.md, Element-first editing).
 * Sections, synopses, notes and the title page are written as Fountain and
 * shown, but aren't chosen from the element picker in 0.2.
 */
export const SCRIPT_ELEMENTS = [
  "scene_heading",
  "action",
  "character",
  "parenthetical",
  "dialogue",
  "transition",
  "centered",
  "lyrics",
] as const;

export type ScriptElement = (typeof SCRIPT_ELEMENTS)[number];

export function isScriptElement(kind: string): kind is ScriptElement {
  return (SCRIPT_ELEMENTS as readonly string[]).includes(kind);
}

/** Ctrl/Cmd+1 to 7, in Final Draft's order where Fountain has the element. */
export const SHORTCUT_ELEMENTS: readonly ScriptElement[] = [
  "scene_heading",
  "action",
  "character",
  "parenthetical",
  "dialogue",
  "transition",
  "centered",
];

type Table = Record<ScriptElement, ScriptElement>;

// docs/DESIGN.md, Keyboard flow (screenplay templates). Centred and lyrics
// aren't in the table; they behave like action and dialogue respectively.
const ENTER: Table = {
  scene_heading: "action",
  action: "action",
  character: "dialogue",
  parenthetical: "dialogue",
  dialogue: "character",
  transition: "scene_heading",
  centered: "action",
  lyrics: "lyrics",
};

const TAB: Table = {
  scene_heading: "action",
  action: "character",
  character: "transition",
  parenthetical: "dialogue",
  dialogue: "parenthetical",
  transition: "scene_heading",
  centered: "action",
  lyrics: "dialogue",
};

const ENTER_ON_EMPTY: Table = {
  scene_heading: "action",
  action: "scene_heading",
  character: "action",
  parenthetical: "dialogue",
  dialogue: "action",
  transition: "action",
  centered: "action",
  lyrics: "action",
};

/** The element a new line gets after Enter at the end of `element`. */
export function enterNext(element: ScriptElement): ScriptElement {
  return ENTER[element];
}

export function tabNext(element: ScriptElement): ScriptElement {
  return TAB[element];
}

/** Shift+Tab reverses Tab. */
export function tabPrevious(element: ScriptElement): ScriptElement {
  const found = SHORTCUT_ELEMENTS.find((e) => TAB[e] === element);
  return found ?? TAB[element];
}

export function enterOnEmpty(element: ScriptElement): ScriptElement {
  return ENTER_ON_EMPTY[element];
}

/** Parts of a speech: they follow a cue with no empty line between. */
export function isSpeechPart(kind: LineKind): boolean {
  return kind === "dialogue" || kind === "parenthetical" || kind === "lyrics";
}

/** Elements that start a paragraph of their own, after an empty line. */
export function startsParagraph(element: ScriptElement): boolean {
  return element !== "dialogue" && element !== "parenthetical";
}

/** Characters the template prints in capitals, so the editor capitalises as you type. */
export function capitalisesInput(element: ScriptElement): boolean {
  return element === "character";
}

/** What a line looks like once the editor has taken its Fountain apart. */
export interface LineSyntax {
  /** Offsets (in the line) of characters that only exist for Fountain. */
  hidden: [from: number, to: number][];
  /** Emphasis, in line offsets. */
  styled: StyledRange[];
  /** Inline notes, shown dimmed, in line offsets without the brackets. */
  notes: [from: number, to: number][];
  /** Where the writer's text starts, after any leading marker. */
  contentStart: number;
}

const LEADING_MARKER: Partial<Record<LineKind, RegExp>> = {
  scene_heading: /^\s*\./,
  action: /^\s*!/,
  character: /^\s*@/,
  transition: /^\s*>\s*/,
  centered: /^\s*>\s*/,
  lyrics: /^\s*~\s*/,
  section: /^\s*#+\s*/,
  synopsis: /^\s*=\s*/,
};

/**
 * The hidden markers and emphasis in one source line read as `kind`.
 * `forced` says whether the parser read a leading marker (a cue that is all
 * capitals without one, or a heading starting INT., has none to hide).
 */
export function lineSyntax(
  text: string,
  kind: LineKind,
  forced: boolean,
): LineSyntax {
  const hidden: [number, number][] = [];
  const notes: [number, number][] = [];
  let start = 0;
  let end = text.length;

  const leading = LEADING_MARKER[kind];
  const alwaysMarked =
    kind === "centered" ||
    kind === "lyrics" ||
    kind === "section" ||
    kind === "synopsis";
  if (leading !== undefined && (forced || alwaysMarked)) {
    const m = leading.exec(text);
    if (m !== null && m[0].length > 0) {
      hidden.push([0, m[0].length]);
      start = m[0].length;
    }
  }
  if (kind === "centered") {
    const m = /\s*<\s*$/.exec(text);
    if (m !== null && m.index >= start) {
      hidden.push([m.index, text.length]);
      end = m.index;
    }
  }
  if (kind === "character") {
    const m = /\s*\^\s*$/.exec(text);
    if (m !== null && m.index >= start) {
      hidden.push([m.index, text.length]);
      end = m.index;
    }
  }

  // Inline notes: hide the brackets, keep the note readable but dimmed.
  const styled: StyledRange[] = [];
  let segment = start;
  const emphasis = (from: number, to: number): void => {
    if (to <= from) return;
    const marks = inlineMarks(text.slice(from, to));
    for (const at of marks.hidden) hidden.push([from + at, from + at + 1]);
    for (const r of marks.styled)
      styled.push({ ...r, from: from + r.from, to: from + r.to });
  };
  for (
    let open = text.indexOf("[[", start);
    open !== -1 && open < end;
    open = text.indexOf("[[", segment)
  ) {
    const close = text.indexOf("]]", open + 2);
    if (close === -1 || close + 2 > end) break;
    emphasis(segment, open);
    hidden.push([open, open + 2], [close, close + 2]);
    notes.push([open + 2, close]);
    segment = close + 2;
  }
  if (kind !== "section" && kind !== "synopsis" && kind !== "page_break")
    emphasis(segment, end);

  hidden.sort((a, b) => a[0] - b[0]);
  return { hidden, styled, notes, contentStart: start };
}

/** Removes a line's forcing marker (and a centred line's closing `<`). */
export function stripMarker(text: string, kind: LineKind): string {
  let body = text;
  const leading =
    kind === "scene_heading" ||
    kind === "action" ||
    kind === "character" ||
    kind === "transition" ||
    kind === "centered" ||
    kind === "lyrics"
      ? LEADING_MARKER[kind]
      : undefined;
  if (leading !== undefined) body = body.replace(leading, "");
  if (kind === "centered") body = body.replace(/\s*<\s*$/, "");
  return body;
}

/** The line written so Fountain can only read it as `element`, where a marker can. */
export function withMarker(body: string, element: ScriptElement): string {
  switch (element) {
    case "scene_heading":
      return `.${body.trimStart()}`;
    case "action":
      return `!${body}`;
    case "character":
      return `@${body.trimStart()}`;
    case "transition":
      return `>${body.trimStart()}`;
    case "centered":
      return `>${body.trim()}<`;
    case "lyrics":
      return `~${body.trimStart()}`;
    case "dialogue":
    case "parenthetical":
      return body;
  }
}

/** A parenthetical's text in brackets, as the parser needs it. */
export function asParenthetical(body: string): string {
  const t = body.trim();
  if (t.startsWith("(") && t.endsWith(")")) return body;
  return `(${t.replace(/^\(|\)$/g, "")})`;
}

/** Takes the brackets off a parenthetical becoming something else. */
export function withoutParentheses(body: string): string {
  const t = body.trim();
  return t.startsWith("(") && t.endsWith(")") ? t.slice(1, -1) : body;
}
