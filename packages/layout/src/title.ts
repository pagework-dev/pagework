import type { Element, Span } from "@pagework/fountain";
import type { TitleArea } from "@pagework/templates";
import type { Geometry } from "./blocks.ts";
import type { Page, PageLine } from "./model.ts";
import { spanLength, wrapSpans } from "./wrap.ts";

/** "Draft date" → "draft_date", the form templates list fields in. */
function fieldKey(key: string): string {
  return key.trim().toLowerCase().replace(/\s+/g, "_");
}

type Placement = "center" | "left" | "right";

function areaLines(
  g: Geometry,
  area: TitleArea,
  fields: Map<string, Span[]>,
  placement: Placement,
): { spans: Span[]; x: number }[][] {
  const t = g.template;
  const style = t.titlePage?.title;
  // The two bottom areas share their lines, so each gets half the width,
  // less one character between them.
  const width =
    placement === "center" ? g.textWidth : g.textWidth / 2 - g.charWidth;
  const max = Math.floor(width / g.charWidth + 1e-9);
  const blocks: { spans: Span[]; x: number }[][] = [];
  for (const name of area.fields) {
    let content = fields.get(name);
    if (content === undefined) continue;
    if (name === "title" && style !== undefined) {
      content = content.map((s) => {
        const span: Span = {
          ...s,
          text: style.case === "upper" ? s.text.toUpperCase() : s.text,
        };
        for (const flag of style.style) span[flag] = true;
        return span;
      });
    }
    blocks.push(
      wrapSpans(content, max).map(({ spans }) => {
        const width = spanLength(spans) * g.charWidth;
        const x =
          placement === "center"
            ? g.textLeft + (g.textWidth - width) / 2
            : placement === "right"
              ? g.textLeft + g.textWidth - width
              : g.textLeft;
        return { spans, x };
      }),
    );
  }
  return blocks;
}

function flatten(
  blocks: { spans: Span[]; x: number }[][],
  spaceBetween: number,
): ({ spans: Span[]; x: number } | null)[] {
  const out: ({ spans: Span[]; x: number } | null)[] = [];
  blocks.forEach((block, i) => {
    if (i > 0) for (let n = 0; n < spaceBetween; n++) out.push(null);
    out.push(...block);
  });
  return out;
}

/** The title page, or null if the script has none or the template doesn't print one. */
export function titlePage(
  elements: readonly Element[],
  g: Geometry,
): Page | null {
  const t = g.template;
  const source = elements.find((e) => e.type === "title_page");
  if (source === undefined || t.titlePage === null) return null;
  const fields = new Map(
    source.fields.map((f) => [fieldKey(f.key), f.content]),
  );
  const lh = t.font.lineHeight;
  const lines: PageLine[] = [];

  const center = flatten(
    areaLines(g, t.titlePage.center, fields, "center"),
    t.titlePage.center.spaceBetween,
  );
  const top = t.titlePage.center.top ?? t.page.margin.top;
  center.forEach((line, i) => {
    if (line !== null)
      lines.push({ ...line, y: top + i * lh, role: "title_page" });
  });

  // The bottom areas end on the last line above the bottom margin.
  const lastRowTop =
    t.page.margin.top +
    (Math.floor(
      (t.page.height - t.page.margin.top - t.page.margin.bottom) / lh + 1e-9,
    ) -
      1) *
      lh;
  for (const [area, placement] of [
    [t.titlePage.bottomLeft, "left"],
    [t.titlePage.bottomRight, "right"],
  ] as const) {
    const block = flatten(
      areaLines(g, area, fields, placement),
      area.spaceBetween,
    );
    block.forEach((line, i) => {
      if (line !== null)
        lines.push({
          ...line,
          y: lastRowTop - (block.length - 1 - i) * lh,
          role: "title_page",
        });
    });
  }
  return { kind: "title", number: null, lines };
}
