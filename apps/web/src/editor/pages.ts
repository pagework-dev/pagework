import {
  StateEffect,
  StateField,
  type ChangeDesc,
  type EditorState,
  type Text,
} from "@codemirror/state";
import type { Element } from "@pagework/fountain";
import type { PageLine, PageModel, SourcePoint } from "@pagework/layout";
import { lineSyntax } from "./elements.ts";
import { elementAt } from "./lines.ts";
import { scriptField } from "./script.ts";

/**
 * Where the paginator broke pages, translated into editor positions, so the
 * page view can draw page edges, (MORE) and (CONT'D) where the PDF has them.
 * Computed after typing pauses (pagination.ts) and mapped through edits made
 * since, until the next count.
 */

/** A line of text the page view draws itself, in points from the page's left edge. */
export interface DrawnLine {
  x: number;
  text: string;
}

export interface PageBreak {
  /** Where the new page starts in the document. */
  pos: number;
  /** True when the break falls inside a source line (a long speech or paragraph). */
  midLine: boolean;
  /** Empty lines left at the foot of the page before the break. */
  fillRows: number;
  /** "(MORE)" at the foot of the page before. */
  more: DrawnLine | null;
  /** Page number in the footer of the page before. */
  footer: DrawnLine | null;
  /** Page number in the header of the new page. */
  header: DrawnLine | null;
  /** The repeated cue at the top of the new page, e.g. "TOM (CONT'D)". */
  cue: DrawnLine | null;
}

export interface CueMarker {
  /** End of the cue's line. */
  pos: number;
  text: string;
}

export interface PageMap {
  /** Script pages, not counting a title page. */
  pages: number;
  hasTitlePage: boolean;
  breaks: PageBreak[];
  markers: CueMarker[];
  /** Empty lines left at the foot of the last page. */
  endFillRows: number;
  /** Page number in the footer of the last page. */
  endFooter: DrawnLine | null;
  /** Names and places in the script, which spellcheck leaves alone. */
  words: ReadonlySet<string>;
}

export const EMPTY_PAGE_MAP: PageMap = {
  pages: 1,
  hasTitlePage: false,
  breaks: [],
  markers: [],
  endFillRows: 0,
  endFooter: null,
  words: new Set(),
};

function textOf(line: PageLine): string {
  return line.spans.map((s) => s.text).join("");
}

function compare(a: SourcePoint, b: SourcePoint): number {
  return a.line - b.line || a.column - b.column;
}

/**
 * The document position of a column in a line's printed text, skipping the
 * characters the editor hides. Tabs in action print as four spaces.
 */
export function positionOf(
  doc: Text,
  elements: readonly Element[],
  point: SourcePoint,
): number {
  if (point.line < 1 || point.line > doc.lines) return doc.length;
  const line = doc.line(point.line);
  if (point.column <= 0) return line.from;
  const element = elementAt(elements, point.line);
  const kind = element?.type ?? "action";
  const forced = element !== null && "forced" in element && element.forced;
  const hidden = lineSyntax(line.text, kind, forced).hidden;
  let printed = 0;
  // Leading spaces don't print outside action.
  let i =
    kind === "action" ? 0 : line.text.length - line.text.trimStart().length;
  for (; i < line.length; i++) {
    if (hidden.some(([from, to]) => i >= from && i < to)) continue;
    if (printed >= point.column) break;
    printed += line.text[i] === "\t" ? 4 : 1;
  }
  return line.from + i;
}

interface Geometry {
  marginTop: number;
  lineHeight: number;
  capacity: number;
  height: number;
}

function rowsUsed(lines: PageLine[], g: Geometry): number {
  let used = 0;
  for (const line of lines) {
    if (line.role === "page_number") continue;
    const row = Math.round((line.y - g.marginTop) / g.lineHeight) + 1;
    used = Math.max(used, row);
  }
  return used;
}

function pageNumber(
  lines: PageLine[],
  g: Geometry,
  where: "header" | "footer",
): DrawnLine | null {
  const found = lines.find(
    (l) =>
      l.role === "page_number" &&
      (where === "header" ? l.y < g.marginTop : l.y > g.height / 2),
  );
  return found === undefined ? null : { x: found.x, text: textOf(found) };
}

export function pageMap(
  model: PageModel,
  state: EditorState,
  margin: { top: number; bottom: number },
): PageMap {
  const { doc } = state;
  const { elements } = state.field(scriptField);
  const g: Geometry = {
    marginTop: margin.top,
    lineHeight: model.font.lineHeight,
    height: model.height,
    capacity: Math.floor(
      (model.height - margin.top - margin.bottom) / model.font.lineHeight +
        1e-9,
    ),
  };
  const breaks: PageBreak[] = [];
  const markers: CueMarker[] = [];
  const title = model.pages[0]?.kind === "title";
  const scriptPages = model.pages.filter((p) => p.kind === "script");

  let previousMax: SourcePoint | null = null;
  let previousLines: PageLine[] | null = null;
  if (title) {
    // The title page is a page of its own; the script starts after it.
    const titleElement = elements.find((e) => e.type === "title_page");
    previousLines = [];
    previousMax =
      titleElement === undefined
        ? null
        : { line: titleElement.lines[1], column: Infinity };
  }

  scriptPages.forEach((page, index) => {
    const sourced = page.lines.filter(
      (l): l is PageLine & { source: SourcePoint } => l.source !== undefined,
    );
    const fresh = sourced.filter(
      (l) => previousMax === null || compare(l.source, previousMax) > 0,
    );
    const start = fresh.reduce<SourcePoint | null>(
      (min, l) => (min === null || compare(l.source, min) < 0 ? l.source : min),
      null,
    );
    for (const line of fresh) {
      if (line.role === "character" && line.marker !== undefined) {
        const docLine = doc.line(Math.min(line.source.line, doc.lines));
        markers.push({ pos: docLine.to, text: line.marker });
      }
    }
    if (start !== null && (index > 0 || title) && previousLines !== null) {
      const top = [...page.lines]
        .filter((l) => l.role !== "page_number")
        .sort((a, b) => a.y - b.y)[0];
      const repeated =
        top?.role === "character" &&
        top.source !== undefined &&
        compare(top.source, start) < 0
          ? { x: top.x, text: textOf(top) }
          : null;
      const more = previousLines.find((l) => l.role === "more");
      const titleRows = title && index === 0 ? titleRowCount(elements) : null;
      breaks.push({
        pos: positionOf(doc, elements, start),
        midLine: start.column > 0,
        fillRows: Math.max(
          0,
          g.capacity - (titleRows ?? rowsUsed(previousLines, g)),
        ),
        more: more === undefined ? null : { x: more.x, text: textOf(more) },
        footer: pageNumber(previousLines, g, "footer"),
        header: pageNumber(page.lines, g, "header"),
        cue: repeated,
      });
    }
    const max = sourced.reduce<SourcePoint | null>(
      (m, l) => (m === null || compare(l.source, m) > 0 ? l.source : m),
      previousMax,
    );
    previousMax = max;
    previousLines = page.lines;
  });

  const last = scriptPages.at(-1);
  return {
    pages: Math.max(1, scriptPages.length),
    hasTitlePage: title,
    breaks,
    markers,
    endFillRows:
      last === undefined
        ? g.capacity
        : Math.max(0, g.capacity - rowsUsed(last.lines, g)),
    endFooter: last === undefined ? null : pageNumber(last.lines, g, "footer"),
    words: new Set(),
  };
}

/** Lines the editor shows for the title page: one per source line. */
function titleRowCount(elements: readonly Element[]): number {
  const title = elements.find((e) => e.type === "title_page");
  return title === undefined ? 0 : title.lines[1] - title.lines[0] + 1;
}

export const setPageMap = StateEffect.define<PageMap>();

function mapPageMap(map: PageMap, changes: ChangeDesc): PageMap {
  return {
    ...map,
    breaks: map.breaks.map((b) => ({ ...b, pos: changes.mapPos(b.pos, 1) })),
    markers: map.markers.map((m) => ({ ...m, pos: changes.mapPos(m.pos, 1) })),
  };
}

export const pageMapField = StateField.define<PageMap>({
  create: () => EMPTY_PAGE_MAP,
  update(map, tr) {
    for (const effect of tr.effects)
      if (effect.is(setPageMap)) return effect.value;
    return tr.docChanged ? mapPageMap(map, tr.changes) : map;
  },
});

/** The script page a document position is on, counting from 1; 0 on the title page. */
export function pageAt(map: PageMap, pos: number): number {
  let page = map.hasTitlePage ? 0 : 1;
  map.breaks.forEach((b, i) => {
    if (pos >= b.pos) page = map.hasTitlePage ? i + 1 : i + 2;
  });
  return Math.min(page, map.pages);
}
