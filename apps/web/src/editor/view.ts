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
import type { Template } from "@pagework/templates";
import { lineSyntax } from "./elements.ts";
import { elementOfLine, elementEditing, pendingField } from "./intents.ts";
import { elementAt, type LineKind } from "./lines.ts";
import { pageMapField, type DrawnLine, type PageBreak } from "./pages.ts";
import { scriptField } from "./script.ts";

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
};

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
  const ranges: Range<Decoration>[] = [];
  const atomic: Range<Decoration>[] = [];
  for (const { from, to } of view.visibleRanges) {
    for (let pos = from; pos <= to;) {
      const line = state.doc.lineAt(pos);
      const element = elementAt(script.elements, line.number);
      const kind = elementOfLine(state, line.number);
      const classes = [lineClass(kind)];
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
      const marker = markersByPos.get(line.to);
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
          update.state.field(pendingField)
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
      tr.startState.field(pendingField) !== tr.state.field(pendingField)
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

function pageEdges(state: EditorState): DecorationSet {
  const map = state.field(pageMapField);
  const ranges: Range<Decoration>[] = [];
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
    if (tr.startState.field(pageMapField) !== tr.state.field(pageMapField))
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
        ? "pw-page-view"
        : "pw-source-view",
    })),
  ];
}
