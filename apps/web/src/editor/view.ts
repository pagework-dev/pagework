import {
  Facet,
  RangeSetBuilder,
  StateField,
  type EditorState,
  type Extension,
  type Range,
} from "@codemirror/state";
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";
import { plainText, type Element } from "@pagework/fountain";
import type { Template } from "@pagework/templates";
import { lineSyntax } from "./elements.ts";
import { elementOfLine, elementEditing, pendingField } from "./intents.ts";
import { elementAt, type LineKind } from "./lines.ts";
import { pageMapField, type DrawnLine, type PageBreak } from "./pages.ts";
import { scriptField } from "./script.ts";

/** Page view shows pages as printed; reflow fits the screen with page breaks as markers. */
export type Layout = "page" | "reflow";

export const layoutFacet = Facet.define<Layout, Layout>({
  combine: (values) => values.at(-1) ?? "page",
});

/** Words for things the editor draws, which live in the app's translation file. */
export interface ViewLabels {
  pageBreak: (page: number) => string;
}

export const labelsFacet = Facet.define<ViewLabels, ViewLabels>({
  combine: (values) => values.at(-1) ?? { pageBreak: (page) => String(page) },
});

/** The template the page view lays out by. */
export const templateFacet = Facet.define<Template, Template | null>({
  combine: (values) => values.at(-1) ?? null,
});

const STYLED_ELEMENTS = [
  "scene_heading",
  "action",
  "character",
  "parenthetical",
  "dialogue",
  "transition",
  "centered",
  "lyrics",
] as const;

/**
 * CSS variables (in points) that size the page and place each element as
 * the template does. styles/editor.css turns them into lengths.
 */
export function templateVariables(template: Template): Record<string, string> {
  const { page, font } = template;
  const textWidth = page.width - page.margin.left - page.margin.right;
  const vars: Record<string, string> = {
    "--page-width": String(page.width),
    "--page-height": String(page.height),
    "--margin-top": String(page.margin.top),
    "--margin-bottom": String(page.margin.bottom),
    "--margin-left": String(page.margin.left),
    "--margin-right": String(page.margin.right),
    "--font-size": String(font.size),
    "--line-height": String(font.lineHeight),
  };
  for (const name of STYLED_ELEMENTS) {
    const style = template.elements[name];
    if (style === undefined) continue;
    const width = style.width ?? textWidth - style.indent;
    vars[`--indent-${name}`] = String(style.indent);
    vars[`--right-${name}`] = String(
      Math.max(0, textWidth - style.indent - width),
    );
    vars[`--space-${name}`] = String(style.spaceBefore);
    vars[`--align-${name}`] = style.align;
    vars[`--case-${name}`] = style.case === "upper" ? "uppercase" : "none";
    vars[`--weight-${name}`] = style.style.includes("bold") ? "700" : "400";
    vars[`--slant-${name}`] = style.style.includes("italic")
      ? "italic"
      : "normal";
    vars[`--underline-${name}`] = style.style.includes("underline")
      ? "underline"
      : "none";
  }
  return vars;
}

const hidden = Decoration.replace({});
const marks = {
  bold: Decoration.mark({ class: "pw-bold" }),
  italic: Decoration.mark({ class: "pw-italic" }),
  underline: Decoration.mark({ class: "pw-underline" }),
  note: Decoration.mark({ class: "pw-note" }),
  titleKey: Decoration.mark({ class: "pw-title-key" }),
  syntax: Decoration.mark({ class: "pw-syntax" }),
  /** A name or place from this script: the browser's spellcheck leaves it alone. */
  known: Decoration.mark({ attributes: { spellcheck: "false" } }),
};

const knownWordsCache = new WeakMap<readonly Element[], Set<string>>();

/**
 * The script's own dictionary (ARCHITECTURE.md, Interface text and
 * spelling): character names and the words of its locations. Browsers'
 * built-in spellcheck can't be given words, so these are marked as text not
 * to check, wherever they appear.
 */
export function knownWords(elements: readonly Element[]): Set<string> {
  const cached = knownWordsCache.get(elements);
  if (cached !== undefined) return cached;
  const words = new Set<string>();
  const add = (text: string): void => {
    for (const m of text.matchAll(/\p{L}[\p{L}'’-]*/gu))
      words.add(m[0].toUpperCase());
  };
  for (const el of elements) {
    if (el.type === "character") add(el.name);
    if (el.type === "scene_heading") {
      const text = plainText(el.content).replace(
        /^(INT\.?\/EXT|INT|EXT|EST|I\/E)[.\s]+/i,
        "",
      );
      add(text.split(" - ")[0] ?? "");
    }
  }
  knownWordsCache.set(elements, words);
  return words;
}

class MarkerWidget extends WidgetType {
  readonly text: string;
  constructor(text: string) {
    super();
    this.text = text;
  }
  override eq(other: MarkerWidget): boolean {
    return other.text === this.text;
  }
  toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = "pw-continued";
    span.textContent = ` ${this.text}`;
    span.setAttribute("aria-hidden", "true");
    return span;
  }
  override ignoreEvent(): boolean {
    return true;
  }
}

function lineClass(kind: LineKind): string {
  if (kind === "blank") return "pw-empty";
  if (
    kind === "section" ||
    kind === "synopsis" ||
    kind === "note" ||
    kind === "boneyard" ||
    kind === "page_break"
  )
    return `pw-muted pw-${kind}`;
  return `pw-${kind}`;
}

interface LineDecorations {
  decorations: DecorationSet;
  atomic: DecorationSet;
}

function buildLines(view: EditorView): LineDecorations {
  const { state } = view;
  const script = state.field(scriptField);
  const pages = state.field(pageMapField);
  const pageStarts = new Set(
    pages.breaks.filter((b) => !b.midLine).map((b) => b.pos),
  );
  const markersByPos = new Map(pages.markers.map((m) => [m.pos, m.text]));
  const formatted = state.facet(elementEditing);
  const known = knownWords(script.elements);
  const ranges: Range<Decoration>[] = [];
  const atomic: Range<Decoration>[] = [];
  for (const { from, to } of view.visibleRanges) {
    for (let pos = from; pos <= to;) {
      const line = state.doc.lineAt(pos);
      const element = elementAt(script.elements, line.number);
      const kind = elementOfLine(state, line.number);
      const classes = formatted ? [lineClass(kind)] : [`pw-src-${kind}`];
      if (element !== null && element.lines[0] === line.number)
        classes.push("pw-first");
      if (line.length === 0 && kind !== "blank") classes.push("pw-first");
      if (pageStarts.has(line.from) || line.number === 1)
        classes.push("pw-page-top");
      if (element?.type === "character" && element.dual !== null)
        classes.push("pw-dual");
      ranges.push(
        Decoration.line({ class: classes.join(" ") }).range(line.from),
      );

      if (element !== null && line.length > 0) {
        const forced = "forced" in element && element.forced;
        const syntax = lineSyntax(line.text, element.type, forced);
        for (const [a, b] of syntax.hidden) {
          if (b <= a) continue;
          if (!formatted) {
            // Show Fountain: the markers stay, lightly coloured.
            ranges.push(marks.syntax.range(line.from + a, line.from + b));
            continue;
          }
          const range = hidden.range(line.from + a, line.from + b);
          ranges.push(range);
          atomic.push(range);
        }
        for (const r of syntax.styled) {
          if (r.bold === true)
            ranges.push(marks.bold.range(line.from + r.from, line.from + r.to));
          if (r.italic === true)
            ranges.push(
              marks.italic.range(line.from + r.from, line.from + r.to),
            );
          if (r.underline === true)
            ranges.push(
              marks.underline.range(line.from + r.from, line.from + r.to),
            );
        }
        for (const [a, b] of syntax.notes)
          if (b > a)
            ranges.push(marks.note.range(line.from + a, line.from + b));
        if (element.type === "title_page") {
          const key = /^[^\s:][^:]*:/.exec(line.text);
          if (key !== null)
            ranges.push(
              marks.titleKey.range(line.from, line.from + key[0].length),
            );
        }
      }
      if (known.size > 0) {
        for (const m of line.text.matchAll(/\p{L}[\p{L}'’-]*/gu)) {
          if (known.has(m[0].toUpperCase()))
            ranges.push(
              marks.known.range(
                line.from + m.index,
                line.from + m.index + m[0].length,
              ),
            );
        }
      }
      const marker = formatted ? markersByPos.get(line.to) : undefined;
      if (marker !== undefined)
        ranges.push(
          Decoration.widget({
            widget: new MarkerWidget(marker),
            side: 1,
          }).range(line.to),
        );
      pos = line.to + 1;
    }
  }
  return {
    decorations: Decoration.set(ranges, true),
    atomic: Decoration.set(atomic, true),
  };
}

const linePlugin = ViewPlugin.fromClass(
  class {
    value: LineDecorations;
    constructor(view: EditorView) {
      this.value = buildLines(view);
    }
    update(update: ViewUpdate): void {
      if (
        update.docChanged ||
        update.viewportChanged ||
        update.startState.field(pageMapField) !==
          update.state.field(pageMapField) ||
        update.startState.field(pendingField) !==
          update.state.field(pendingField) ||
        update.startState.facet(elementEditing) !==
          update.state.facet(elementEditing)
      )
        this.value = buildLines(update.view);
    }
  },
  { decorations: (plugin) => plugin.value.decorations },
);

/**
 * The empty line between two paragraphs is how Fountain separates them; on
 * the page the template's spacing does that job, so the line is hidden and
 * the cursor steps over it. Further empty lines print, so they show.
 */
function separators(state: EditorState): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  if (!state.facet(elementEditing)) return builder.finish();
  const pending = state.field(pendingField);
  let previousEmpty = true;
  let previousEnd = 0;
  let from = 0;
  for (const text of state.doc.iterLines()) {
    const empty = text.length === 0;
    if (empty && !previousEmpty && pending?.pos !== from)
      builder.add(previousEnd, from, hidden);
    previousEmpty = empty;
    previousEnd = from + text.length;
    from = previousEnd + 1;
  }
  return builder.finish();
}

const separatorField = StateField.define<DecorationSet>({
  create: separators,
  update(value, tr) {
    if (
      tr.docChanged ||
      tr.startState.field(pendingField) !== tr.state.field(pendingField) ||
      tr.startState.facet(elementEditing) !== tr.state.facet(elementEditing)
    )
      return separators(tr.state);
    return value;
  },
  provide: (field) => [
    EditorView.decorations.from(field),
    EditorView.atomicRanges.of((view) => view.state.field(field)),
  ],
});

class PageEdgeWidget extends WidgetType {
  readonly edge: PageBreak | null;
  readonly endFill: number;
  readonly endFooter: DrawnLine | null;
  readonly indent: number;
  constructor(
    edge: PageBreak | null,
    endFill: number,
    endFooter: DrawnLine | null,
    indent: number,
  ) {
    super();
    this.edge = edge;
    this.endFill = endFill;
    this.endFooter = endFooter;
    this.indent = indent;
  }
  override eq(other: PageEdgeWidget): boolean {
    return JSON.stringify(other) === JSON.stringify(this);
  }
  toDOM(): HTMLElement {
    const root = document.createElement("div");
    root.className =
      this.edge?.midLine === true ? "pw-edge pw-edge-inline" : "pw-edge";
    root.style.setProperty("--edge-indent", String(this.indent));
    root.setAttribute("aria-hidden", "true");
    const fillRows = this.edge?.fillRows ?? this.endFill;
    const fill = row("pw-edge-fill", fillRows);
    if (this.edge?.more != null) fill.append(drawn(this.edge.more, 0));
    root.append(fill);
    const bottom = document.createElement("div");
    bottom.className = "pw-edge-bottom";
    const footer = this.edge === null ? this.endFooter : this.edge.footer;
    if (footer !== null) bottom.append(drawn(footer, 0));
    root.append(bottom);
    if (this.edge !== null) {
      const gap = document.createElement("div");
      gap.className = "pw-edge-gap";
      root.append(gap);
      const top = document.createElement("div");
      top.className = "pw-edge-top";
      if (this.edge.header !== null) top.append(drawn(this.edge.header, 0));
      root.append(top);
      if (this.edge.cue !== null) {
        const cue = row("pw-edge-cue", 1);
        cue.append(drawn(this.edge.cue, 0));
        root.append(cue);
      }
    }
    return root;
  }
  override ignoreEvent(): boolean {
    return true;
  }
  override get estimatedHeight(): number {
    return -1;
  }
}

function row(className: string, rows: number): HTMLElement {
  const el = document.createElement("div");
  el.className = className;
  el.style.setProperty("--rows", String(rows));
  return el;
}

function drawn(line: DrawnLine, rowIndex: number): HTMLElement {
  const el = document.createElement("span");
  el.className = "pw-drawn";
  el.textContent = line.text;
  el.style.setProperty("--x", String(line.x));
  el.style.setProperty("--row", String(rowIndex));
  return el;
}

function indentAt(state: EditorState, pos: number): number {
  const template = state.facet(templateFacet);
  if (template === null) return 0;
  const kind = elementOfLine(state, state.doc.lineAt(pos).number);
  const style =
    kind === "blank"
      ? undefined
      : template.elements[kind as keyof Template["elements"]];
  return style?.indent ?? 0;
}

class PageMarkerWidget extends WidgetType {
  readonly label: string;
  constructor(label: string) {
    super();
    this.label = label;
  }
  override eq(other: PageMarkerWidget): boolean {
    return other.label === this.label;
  }
  toDOM(): HTMLElement {
    const el = document.createElement("div");
    el.className = "pw-page-marker";
    el.textContent = this.label;
    return el;
  }
  override ignoreEvent(): boolean {
    return true;
  }
}

function pageEdges(state: EditorState): DecorationSet {
  if (!state.facet(elementEditing)) return Decoration.none;
  const map = state.field(pageMapField);
  const ranges: Range<Decoration>[] = [];
  if (state.facet(layoutFacet) === "reflow") {
    // Reflow: a marker where each page starts, at the start of its line.
    const labels = state.facet(labelsFacet);
    map.breaks.forEach((edge, i) => {
      const page = map.hasTitlePage ? i + 1 : i + 2;
      const line = state.doc.lineAt(Math.min(edge.pos, state.doc.length));
      ranges.push(
        Decoration.widget({
          widget: new PageMarkerWidget(labels.pageBreak(page)),
          side: -1,
          block: true,
        }).range(line.from),
      );
    });
    return Decoration.set(ranges, true);
  }
  for (const edge of map.breaks) {
    const pos = Math.min(edge.pos, state.doc.length);
    const widget = new PageEdgeWidget(
      edge,
      0,
      null,
      edge.midLine ? indentAt(state, pos) : 0,
    );
    ranges.push(
      edge.midLine
        ? Decoration.widget({ widget, side: -1 }).range(pos)
        : Decoration.widget({ widget, side: -1, block: true }).range(
            state.doc.lineAt(pos).from,
          ),
    );
  }
  ranges.push(
    Decoration.widget({
      widget: new PageEdgeWidget(null, map.endFillRows, map.endFooter, 0),
      side: 1,
      block: true,
    }).range(state.doc.length),
  );
  return Decoration.set(ranges, true);
}

const pageEdgeField = StateField.define<DecorationSet>({
  create: pageEdges,
  update(value, tr) {
    if (
      tr.startState.field(pageMapField) !== tr.state.field(pageMapField) ||
      tr.startState.facet(elementEditing) !== tr.state.facet(elementEditing) ||
      tr.startState.facet(layoutFacet) !== tr.state.facet(layoutFacet)
    )
      return pageEdges(tr.state);
    return tr.docChanged ? value.map(tr.changes) : value;
  },
  provide: (field) => EditorView.decorations.from(field),
});

/** The formatted page: elements laid out as the template prints them. */
export function pageView(): Extension {
  return [
    linePlugin,
    EditorView.atomicRanges.of(
      (view) => view.plugin(linePlugin)?.value.atomic ?? Decoration.none,
    ),
    separatorField,
    pageEdgeField,
    EditorView.editorAttributes.of((view) => ({
      class: view.state.facet(elementEditing)
        ? `pw-page-view pw-layout-${view.state.facet(layoutFacet)}`
        : "pw-source-view",
    })),
  ];
}
