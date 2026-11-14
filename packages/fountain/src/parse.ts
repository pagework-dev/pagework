import type {
  Character,
  Element,
  LineRange,
  SceneHeading,
  Span,
  TitleField,
  TitlePage,
} from "./elements.ts";
import { joinLines } from "./emphasis.ts";
import { isKeptEmptyLine, logicalLines, type LogicalLine } from "./lines.ts";

/**
 * Title page keys from the Fountain 1.1 guide. Only these can start a title
 * page; once one has, any `Key:` line adds a field. Without this, a script
 * opening with "FADE IN:" would be read as a title page.
 */
const TITLE_PAGE_KEYS = new Set([
  "title",
  "credit",
  "author",
  "authors",
  "source",
  "draft date",
  "date",
  "contact",
  "copyright",
  "notes",
  "revision",
]);

const SCENE_HEADING = /^(?:INT|EXT|EST|INT\.?\/EXT|I\/E)[.\s]/i;
const SCENE_NUMBER = /\s*#([A-Za-z0-9.-]+)#\s*$/;
const TITLE_KEY = /^([^\s:][^:]*?)\s*:\s*(.*)$/;
const CUE = /^([^(]*?)\s*((?:\([^)]*\)\s*)*)$/;

type LineKind =
  | { kind: "blank" }
  | { kind: "hidden" }
  | { kind: "action"; text: string; forced: boolean }
  | { kind: "dialogue"; text: string }
  | { kind: "lyrics"; text: string }
  | { kind: "centered"; text: string }
  | { kind: "parenthetical"; text: string }
  | { kind: "scene_heading"; text: string; forced: boolean }
  | { kind: "transition"; text: string; forced: boolean }
  | { kind: "character"; text: string; forced: boolean }
  | { kind: "page_break" }
  | { kind: "section"; depth: number; text: string }
  | { kind: "synopsis"; text: string };

function hasLetter(text: string): boolean {
  return /\p{L}/u.test(text);
}

function isUpperCase(text: string): boolean {
  return hasLetter(text) && text === text.toUpperCase();
}

function isCharacterCue(text: string): boolean {
  const cue = CUE.exec(text.replace(/\s*\^$/, ""));
  const name = cue?.[1];
  return name !== undefined && name !== "" && isUpperCase(name);
}

function isHidden(line: LogicalLine): boolean {
  return line.regions.length > 0 && line.text.trim() === "";
}

function isBlank(line: LogicalLine): boolean {
  return line.text.trim() === "" && line.regions.length === 0;
}

/** Tabs in action are converted to four spaces (Fountain 1.1, Indenting). */
function actionText(text: string): string {
  return text.replace(/\t/g, "    ").trimEnd();
}

function classify(lines: LogicalLine[], start: number): LineKind[] {
  const kinds: LineKind[] = [];
  let inDialogue = false;

  // Hidden lines (notes and boneyard on their own) are invisible to the
  // blank-line rules: a note between a cue and its speech keeps them together.
  const neighbourIsBlank = (from: number, step: 1 | -1): boolean => {
    for (let j = from + step; j >= start && j < lines.length; j += step) {
      const line = lines[j];
      if (line === undefined || isHidden(line)) continue;
      const kind = step === -1 ? kinds[j - start] : undefined;
      if (kind !== undefined) return kind.kind === "blank";
      return isBlank(line);
    }
    return true;
  };

  for (let i = start; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) break;
    const push = (kind: LineKind): void => {
      kinds.push(kind);
    };
    if (isHidden(line)) {
      push({ kind: "hidden" });
      continue;
    }
    const raw = line.text.trimEnd();
    const t = raw.trim();
    const prevBlank = neighbourIsBlank(i, -1);

    // A line of spaces inside a paragraph is an empty line of that paragraph;
    // anywhere else it is just a blank line.
    if (t === "" && !(isKeptEmptyLine(line.text) && !prevBlank)) {
      inDialogue = false;
      push({ kind: "blank" });
      continue;
    }

    if (inDialogue) {
      if (t.startsWith("~"))
        push({ kind: "lyrics", text: t.slice(1).trimStart() });
      else if (t.startsWith("(") && t.endsWith(")"))
        push({ kind: "parenthetical", text: t });
      else push({ kind: "dialogue", text: t });
      continue;
    }

    const nextBlank = neighbourIsBlank(i, 1);

    if (/^={3,}$/.test(t)) {
      push({ kind: "page_break" });
    } else if (t.startsWith("#")) {
      const hashes = /^#+/.exec(t)?.[0].length ?? 1;
      push({ kind: "section", depth: hashes, text: t.slice(hashes).trim() });
    } else if (t.startsWith("=")) {
      push({ kind: "synopsis", text: t.slice(1).trim() });
    } else if (t.startsWith("~")) {
      push({ kind: "lyrics", text: t.slice(1).trimStart() });
    } else if (t.startsWith(">") && t.endsWith("<") && t.length >= 2) {
      push({ kind: "centered", text: t.slice(1, -1).trim() });
    } else if (t.startsWith(">")) {
      push({ kind: "transition", text: t.slice(1).trim(), forced: true });
    } else if (t.startsWith("!")) {
      push({
        kind: "action",
        text: actionText(raw.slice(raw.indexOf("!") + 1)),
        forced: true,
      });
    } else if (t.startsWith("@")) {
      push({ kind: "character", text: t.slice(1).trim(), forced: true });
      inDialogue = true;
    } else if (/^\.[\p{L}\p{N}]/u.test(t) && prevBlank) {
      push({ kind: "scene_heading", text: t.slice(1), forced: true });
    } else if (prevBlank && nextBlank && SCENE_HEADING.test(t)) {
      push({ kind: "scene_heading", text: t, forced: false });
    } else if (prevBlank && nextBlank && isUpperCase(t) && t.endsWith("TO:")) {
      push({ kind: "transition", text: t, forced: false });
    } else if (prevBlank && !nextBlank && isCharacterCue(t)) {
      push({ kind: "character", text: t, forced: false });
      inDialogue = true;
    } else {
      push({ kind: "action", text: actionText(raw), forced: false });
    }
  }
  return kinds;
}

function notesOf(lines: LogicalLine[]): string[] {
  return lines.flatMap((l) =>
    l.regions.filter((r) => r.kind === "note").map((r) => r.text),
  );
}

function withNotes<T extends Element>(element: T, lines: LogicalLine[]): T {
  const notes = notesOf(lines);
  if (notes.length > 0) element.notes = notes;
  return element;
}

function rangeOf(lines: LogicalLine[]): LineRange {
  return [lines[0]?.first ?? 0, lines.at(-1)?.last ?? 0];
}

function sceneHeading(
  text: string,
  forced: boolean,
  range: LineRange,
): SceneHeading {
  const number = SCENE_NUMBER.exec(text);
  const heading = number === null ? text : text.slice(0, number.index);
  return {
    type: "scene_heading",
    lines: range,
    content: joinLines([heading.trim()]),
    sceneNumber: number?.[1] ?? null,
    forced,
  };
}

function character(text: string, forced: boolean, range: LineRange): Character {
  const dual = /\s*\^$/.test(text);
  const cue = text.replace(/\s*\^$/, "");
  const match = CUE.exec(cue);
  const name = (match?.[1] ?? cue).trim();
  const extensions = [...(match?.[2] ?? "").matchAll(/\(([^)]*)\)/g)].map(
    (m) => m[1] ?? "",
  );
  return {
    type: "character",
    lines: range,
    name,
    extensions,
    dual: dual ? "right" : null,
    forced,
  };
}

function parseTitlePage(
  lines: LogicalLine[],
): { titlePage: TitlePage; next: number } | null {
  let i = lines.findIndex((line) => !isBlank(line));
  if (i === -1) i = lines.length;
  const firstLine = lines[i];
  const firstKey =
    firstLine === undefined ? null : TITLE_KEY.exec(firstLine.text);
  if (
    firstKey?.[1] === undefined ||
    !TITLE_PAGE_KEYS.has(firstKey[1].toLowerCase())
  )
    return null;

  const fields: { key: string; values: string[] }[] = [];
  const start = i;
  for (; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined || isBlank(line)) break;
    const key = /^\s/.test(line.text) ? null : TITLE_KEY.exec(line.text);
    if (key?.[1] !== undefined) {
      const value = (key[2] ?? "").trim();
      fields.push({ key: key[1], values: value === "" ? [] : [value] });
    } else {
      fields.at(-1)?.values.push(line.text.trim());
    }
  }
  const titleFields: TitleField[] = fields.map((f) => ({
    key: f.key,
    content: joinLines(f.values),
  }));
  return {
    titlePage: {
      type: "title_page",
      lines: rangeOf(lines.slice(start, i)),
      fields: titleFields,
    },
    next: i,
  };
}

const MERGEABLE = new Set(["action", "dialogue", "lyrics", "centered"]);

/** Marks the cue a `^` cue pairs with, or drops the `^` if there is none. */
function pairDualDialogue(elements: Element[], cue: Character): void {
  for (let j = elements.length - 1; j >= 0; j--) {
    const el = elements[j];
    if (el === undefined) break;
    if (el.type === "character") {
      if (el.dual === null) {
        el.dual = "left";
        return;
      }
      break;
    }
    const partOfSpeech = [
      "dialogue",
      "parenthetical",
      "lyrics",
      "note",
      "boneyard",
    ];
    if (!partOfSpeech.includes(el.type)) break;
  }
  cue.dual = null;
}

/** Parses Fountain text into a typed element list. */
export function parse(source: string): Element[] {
  const lines = logicalLines(source);
  const elements: Element[] = [];

  const title = parseTitlePage(lines);
  if (title !== null) elements.push(title.titlePage);
  const start = title?.next ?? 0;
  const kinds = classify(lines, start);

  for (let k = 0; k < kinds.length; k++) {
    const kind = kinds[k];
    const line = lines[start + k];
    if (kind === undefined || line === undefined) break;

    if (kind.kind === "blank") continue;
    if (kind.kind === "hidden") {
      for (const region of line.regions) {
        elements.push({
          type: region.kind,
          lines: [line.first, line.last],
          text: region.text,
        });
      }
      continue;
    }

    if (MERGEABLE.has(kind.kind) && "text" in kind) {
      const group = [line];
      const texts = [kind.text];
      while (k + 1 < kinds.length && kinds[k + 1]?.kind === kind.kind) {
        k++;
        const next = kinds[k];
        const nextLine = lines[start + k];
        if (next === undefined || nextLine === undefined || !("text" in next))
          break;
        group.push(nextLine);
        texts.push(next.text);
      }
      const range = rangeOf(group);
      const content: Span[] = joinLines(texts);
      if (kind.kind === "action") {
        elements.push(
          withNotes(
            { type: "action", lines: range, content, forced: kind.forced },
            group,
          ),
        );
      } else if (
        kind.kind === "dialogue" ||
        kind.kind === "lyrics" ||
        kind.kind === "centered"
      ) {
        elements.push(
          withNotes({ type: kind.kind, lines: range, content }, group),
        );
      }
      continue;
    }

    const range: LineRange = [line.first, line.last];
    switch (kind.kind) {
      case "scene_heading":
        elements.push(
          withNotes(sceneHeading(kind.text, kind.forced, range), [line]),
        );
        break;
      case "character": {
        const cue = withNotes(character(kind.text, kind.forced, range), [line]);
        if (cue.dual === "right") pairDualDialogue(elements, cue);
        elements.push(cue);
        break;
      }
      case "parenthetical":
        elements.push(
          withNotes(
            {
              type: "parenthetical",
              lines: range,
              content: joinLines([kind.text]),
            },
            [line],
          ),
        );
        break;
      case "transition":
        elements.push(
          withNotes(
            {
              type: "transition",
              lines: range,
              content: joinLines([kind.text]),
              forced: kind.forced,
            },
            [line],
          ),
        );
        break;
      case "page_break":
        elements.push({ type: "page_break", lines: range });
        break;
      case "section":
        elements.push({
          type: "section",
          lines: range,
          depth: kind.depth,
          text: kind.text,
        });
        break;
      case "synopsis":
        elements.push({ type: "synopsis", lines: range, text: kind.text });
        break;
      default:
        break;
    }
  }
  return elements;
}
