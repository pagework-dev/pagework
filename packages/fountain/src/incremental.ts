import type { Element, ElementType, LineRange } from "./elements.ts";
import { logicalLines, normaliseNewlines } from "./lines.ts";
import { parse, parseLines } from "./parse.ts";

/**
 * Incremental parsing for the editor's keystroke path (ARCHITECTURE.md,
 * Performance budgets). A keystroke re-parses the paragraphs around the edit
 * and reuses every other element, and the result is always exactly what
 * `parse` gives for the whole new text; the tests compare the two after
 * random edits.
 *
 * Fountain's rules reach across lines: a cue needs a blank line before and
 * text after, empty lines pass through as action, and a `^` cue pairs with the
 * speech before it. So the re-parsed window starts and ends at a *boundary*:
 * an exactly empty line that follows a printed element no speech can reach
 * back past (see BARRIERS). At a boundary the parser's state is always the
 * same, so the text on either side can't change how the other side parses.
 *
 * Boneyard (`/* … *\/`) is the exception: opening one can swallow the rest of
 * the script. Any edit that adds or removes a boneyard delimiter, or whose
 * window contains one, falls back to a full parse.
 */

export interface ParsedScript {
  /** The script text, with line endings normalised to "\n" and no byte-order mark. */
  readonly source: string;
  /** `source` split at "\n". Index 0 is line 1. */
  readonly lines: readonly string[];
  readonly elements: readonly Element[];
  /**
   * The source lines (1-based, inclusive) the last update parsed again, or
   * null when it parsed the whole script.
   */
  readonly reparsed: LineRange | null;
}

/** Replace `source.slice(from, to)` with `insert`. Offsets are into `ParsedScript.source`. */
export interface TextEdit {
  from: number;
  to: number;
  insert: string;
}

/**
 * Elements a `^` cue can't pair across (pairDualDialogue in parse.ts stops at
 * anything that isn't part of a speech), and that always print.
 */
const BARRIERS: ReadonlySet<ElementType> = new Set<ElementType>([
  "scene_heading",
  "action",
  "transition",
  "centered",
  "page_break",
  "section",
  "synopsis",
]);

export function parseScript(source: string): ParsedScript {
  const text = normaliseNewlines(source);
  return {
    source: text,
    lines: text.split("\n"),
    elements: parse(text),
    reparsed: null,
  };
}

function countNewlines(text: string): number {
  let n = 0;
  for (let i = text.indexOf("\n"); i !== -1; i = text.indexOf("\n", i + 1)) n++;
  return n;
}

function hasBoneyardDelimiter(text: string): boolean {
  return text.includes("/*") || text.includes("*/");
}

/** Index of the first element whose last line is at or after `line` (1-based). */
function firstEndingAtOrAfter(
  elements: readonly Element[],
  line: number,
): number {
  let lo = 0;
  let hi = elements.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    const el = elements[mid];
    if (el !== undefined && el.lines[1] < line) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * Whether 0-based line `i` starts a fragment the parser can begin at: line
 * i-1 is exactly empty and belongs to no element (so it isn't inside a note
 * or boneyard, or an empty line printed as action), and line i-2 ends a
 * barrier element.
 */
function isBoundary(
  lines: readonly string[],
  elements: readonly Element[],
  i: number,
): boolean {
  if (i === 0) return true;
  if (i < 2 || lines[i - 1] !== "") return false;
  // 0-based line i-2 is 1-based line i-1.
  const k = firstEndingAtOrAfter(elements, i - 1);
  if (elements[k]?.lines[1] !== i - 1) return false;
  // Several hidden elements can share a line; the last one ending there decides.
  let last = k;
  while (elements[last + 1]?.lines[1] === i - 1) last++;
  const ending = elements[last];
  if (ending === undefined || !BARRIERS.has(ending.type)) return false;
  const after = elements[last + 1];
  return after === undefined || after.lines[0] > i;
}

function shift(element: Element, delta: number): Element {
  if (delta === 0) return element;
  return {
    ...element,
    lines: [element.lines[0] + delta, element.lines[1] + delta],
  };
}

/** Applies an edit and re-parses only the paragraphs it can affect. */
export function updateScript(prev: ParsedScript, edit: TextEdit): ParsedScript {
  const { from, to } = edit;
  if (
    !Number.isInteger(from) ||
    !Number.isInteger(to) ||
    from < 0 ||
    to < from ||
    to > prev.source.length
  ) {
    throw new RangeError(
      `Edit ${String(from)}–${String(to)} is outside a text of length ${String(prev.source.length)}`,
    );
  }
  const insert = edit.insert.replace(/\r\n?/g, "\n");
  const source = prev.source.slice(0, from) + insert + prev.source.slice(to);
  if (source.startsWith("﻿")) return parseScript(source);

  // Joining text can make a delimiter ("/" + "*"), so look one character
  // either side of the edit.
  const oldAround = prev.source.slice(Math.max(0, from - 1), to + 1);
  const newAround = source.slice(
    Math.max(0, from - 1),
    from + insert.length + 1,
  );
  if (hasBoneyardDelimiter(oldAround) || hasBoneyardDelimiter(newAround))
    return parseScript(source);

  // 0-based lines: the edit runs from `first` to `lastOld` in the old text,
  // and from `first` to `lastNew` in the new one.
  const first = countNewlines(prev.source.slice(0, from));
  const removedLines = countNewlines(prev.source.slice(from, to));
  const insertedLines = countNewlines(insert);
  const lastOld = first + removedLines;
  const lastNew = first + insertedLines;
  const delta = insertedLines - removedLines;

  const lineStart = prev.source.lastIndexOf("\n", from - 1) + 1;
  const nextBreak = prev.source.indexOf("\n", to);
  const lineEnd = nextBreak === -1 ? prev.source.length : nextBreak;
  const middle = (
    prev.source.slice(lineStart, from) +
    insert +
    prev.source.slice(to, lineEnd)
  ).split("\n");
  const lines = [
    ...prev.lines.slice(0, first),
    ...middle,
    ...prev.lines.slice(lastOld + 1),
  ];

  let start = first;
  while (!isBoundary(prev.lines, prev.elements, start)) start--;

  // Try the nearest boundary after the edit first. It must be a boundary in
  // the old text too, and, once the window is parsed, in the new one.
  let window: Element[];
  let end = lastNew + 2;
  let attempts = 0;
  for (;;) {
    while (
      end < lines.length &&
      !(
        lines[end - 1] === "" &&
        isBoundary(prev.lines, prev.elements, end - delta)
      )
    )
      end++;
    if (end >= lines.length || attempts === 2) end = lines.length;
    const text = lines.slice(start, end).join("\n");
    if (hasBoneyardDelimiter(text)) return parseScript(source);
    window = parseLines(logicalLines(text, start + 1), {
      atStart: start === 0,
    });
    if (end === lines.length || isBoundary(lines, window, end)) break;
    attempts++;
    end++;
  }

  const before = prev.elements.slice(
    0,
    firstEndingAtOrAfter(prev.elements, start + 1),
  );
  const oldEnd = end - delta;
  const after: Element[] = [];
  if (end < lines.length) {
    for (
      let k = firstEndingAtOrAfter(prev.elements, oldEnd + 1);
      k < prev.elements.length;
      k++
    ) {
      const element = prev.elements[k];
      if (element !== undefined) after.push(shift(element, delta));
    }
  }

  return {
    source,
    lines,
    elements: [...before, ...window, ...after],
    reparsed: [start + 1, end],
  };
}
