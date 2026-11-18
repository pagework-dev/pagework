import {
  updateScript,
  type Element,
  type ParsedScript,
} from "@pagework/fountain";
import {
  asParenthetical,
  stripMarker,
  withMarker,
  type ScriptElement,
} from "./elements.ts";
import { elementAt, type LineKind } from "./lines.ts";

/**
 * "The editor owns the markers" (ARCHITECTURE.md, Editing behaviour): after
 * every edit, each line in the re-parsed region is checked against the
 * element the writer chose for it, and Fountain forcing markers are added
 * where inference alone would read it wrongly, or removed where they are no
 * longer needed. Only markers change, plus the brackets of a parenthetical;
 * the writer's words never do.
 *
 * Some choices can't be written in Fountain at all: dialogue needs a cue
 * above it, and a dialogue line that is entirely in brackets is always a
 * parenthetical. Those lines are left as the parser reads them.
 */

export type IntentOf = (line: number) => ScriptElement | undefined;

export interface LineChange {
  /** 1-based line. */
  line: number;
  text: string;
}

export interface Normalised {
  script: ParsedScript;
  /** Final text of each line that changed, in line order. */
  changes: LineChange[];
}

function kindAt(script: ParsedScript, line: number): LineKind {
  return elementAt(script.elements, line)?.type ?? "blank";
}

function isForced(element: Element | null): boolean {
  return element !== null && "forced" in element && element.forced;
}

/** Character offset where a 1-based line starts. */
function lineStart(script: ParsedScript, line: number): number {
  let pos = 0;
  for (let i = 0; i < line - 1; i++) pos += (script.lines[i] ?? "").length + 1;
  return pos;
}

function replaceLine(
  script: ParsedScript,
  line: number,
  text: string,
  start: number,
): ParsedScript {
  const old = script.lines[line - 1] ?? "";
  return updateScript(script, {
    from: start,
    to: start + old.length,
    insert: text,
  });
}

/** Text the line could have so it reads as `want`, preferring no marker. */
function candidates(
  text: string,
  have: LineKind,
  want: ScriptElement,
): string[] {
  const marked = want === "parenthetical" ? text : stripMarker(text, want);
  let body = marked === text ? stripMarker(text, have) : marked;
  if (want === "parenthetical") body = asParenthetical(body);
  const out = [body, withMarker(body, want)];
  return [...new Set(out)].filter((c) => c !== text);
}

export function normalise(
  script: ParsedScript,
  first: number,
  last: number,
  intentOf: IntentOf,
): Normalised {
  let current = script;
  const changed = new Map<number, string>();
  // Line offsets don't change (only text within lines does), so compute
  // each line's start once per pass and adjust as lines change.
  for (let pass = 0; pass < 3; pass++) {
    let progress = false;
    let start = lineStart(current, first);
    for (let line = first; line <= last; line++) {
      const text = current.lines[line - 1];
      if (text === undefined) break;
      const lineFrom = start;
      start += text.length + 1;
      const want = intentOf(line);
      if (want === undefined || text.trim() === "") continue;
      const element = elementAt(current.elements, line);
      const have = element?.type ?? "blank";
      const removable =
        have === want &&
        isForced(element) &&
        (want === "scene_heading" ||
          want === "action" ||
          want === "character" ||
          want === "transition");
      if (have === want && !removable) continue;
      const tryLines = removable
        ? [stripMarker(text, have)]
        : candidates(text, have, want);
      for (const candidate of tryLines) {
        const next = replaceLine(current, line, candidate, lineFrom);
        if (kindAt(next, line) !== want) continue;
        if (!keepsOthers(current, next, first, last, line, intentOf)) continue;
        current = next;
        changed.set(line, candidate);
        start += candidate.length - text.length;
        progress = true;
        break;
      }
    }
    if (!progress) break;
  }
  const changes = [...changed.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([line, text]) => ({ line, text }));
  return { script: current, changes };
}

/**
 * A change to one line may not break another line that already read as
 * its writer chose, anywhere the change made the parser look again.
 */
function keepsOthers(
  before: ParsedScript,
  after: ParsedScript,
  first: number,
  last: number,
  changedLine: number,
  intentOf: IntentOf,
): boolean {
  const window = after.reparsed ?? [1, after.lines.length];
  const from = Math.min(first, window[0]);
  const to = Math.max(last, window[1]);
  for (let line = from; line <= to; line++) {
    if (line === changedLine) continue;
    const want = intentOf(line);
    if (want === undefined) continue;
    if (kindAt(before, line) === want && kindAt(after, line) !== want)
      return false;
  }
  return true;
}
