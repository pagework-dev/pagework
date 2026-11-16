import type { Element } from "@pagework/fountain";
import type { Template } from "@pagework/templates";
import {
  buildBlocks,
  geometry,
  type Block,
  type Geometry,
  type RowGroup,
  type Speech,
} from "./blocks.ts";
import type { Page, PageLine, PageModel } from "./model.ts";
import { titlePage } from "./title.ts";
import { spanLength } from "./wrap.ts";

interface Cursor {
  pages: Page[];
  page: Page;
  /** Body lines used on the current page. */
  row: number;
}

/** Lines on a page between the top and bottom margins. */
function bodyRows(t: Template): number {
  const { height, margin } = t.page;
  return Math.floor(
    (height - margin.top - margin.bottom) / t.font.lineHeight + 1e-9,
  );
}

/** Smallest number of lines a block can put at the foot of a page, after its space. */
function minimumFootprint(block: Block | undefined, t: Template): number {
  if (block === undefined || block.kind === "page_break") return 0;
  const keep = t.pagination.sceneHeading.keepWithNext;
  if (block.kind === "lines") {
    return block.splittable
      ? Math.min(keep, block.rows.length)
      : block.rows.length;
  }
  const { speech } = block;
  const whole = 1 + speech.body.length;
  const min = t.pagination.dialogue.minLinesEachSide;
  const canSplit = t.pagination.dialogue.split && speech.body.length >= 2 * min;
  return canSplit ? Math.min(whole, 1 + min + 1) : whole;
}

/**
 * Where to split a speech: the number of body lines that stay on this page,
 * or 0 if it can't be split into the space left. The cue, those lines and
 * (MORE) must fit; each side needs the template's minimum of lines; and a
 * parenthetical is never left as the last line before (MORE).
 */
function speechSplit(speech: Speech, available: number, t: Template): number {
  const { split, minLinesEachSide: min } = t.pagination.dialogue;
  if (!split) return 0;
  const n = speech.body.length;
  for (let k = Math.min(available - 2, n - min); k >= min; k--) {
    const last = speech.body[k - 1];
    if (last?.some((row) => row.role === "parenthetical") === true) continue;
    return k;
  }
  return 0;
}

export function paginate(
  elements: readonly Element[],
  template: Template,
): PageModel {
  if (template.kind !== "screenplay") {
    throw new Error(`Layout for ${template.kind} templates is not built yet`);
  }
  if (template.abstract) {
    throw new Error(
      `"${template.id}" is a base template and can't be used for a script`,
    );
  }
  const g = geometry(template);
  const t = template;
  const capacity = bodyRows(t);
  const blocks = buildBlocks(elements, g);

  const newPage = (): Page => ({ kind: "script", number: null, lines: [] });
  const first = newPage();
  const c: Cursor = { pages: [first], page: first, row: 0 };

  const breakPage = (): void => {
    c.page = newPage();
    c.pages.push(c.page);
    c.row = 0;
  };
  const emit = (groups: RowGroup[], space: number): void => {
    c.row += space;
    for (const group of groups) {
      const y = t.page.margin.top + c.row * t.font.lineHeight;
      for (const row of group) c.page.lines.push({ ...row, y });
      c.row++;
    }
  };
  const atTop = (): boolean => c.row === 0;
  const spaceFor = (block: { spaceBefore: number }): number =>
    atTop() ? 0 : block.spaceBefore;

  const placeSpeech = (speech: Speech, spaceBefore: number): void => {
    let marker = speech.marker;
    let body = speech.body;
    for (;;) {
      const space = atTop() ? 0 : spaceBefore;
      const available = capacity - c.row - space;
      if (1 + body.length <= available) {
        emit([speech.cue(marker), ...body], space);
        return;
      }
      const k = speechSplit({ ...speech, body }, available, t);
      if (k > 0) {
        emit([speech.cue(marker), ...body.slice(0, k), speech.more], space);
        body = body.slice(k);
        // One marker on the continued cue: the split's (CONT'D) replaces
        // the character-continued one rather than adding a second.
        marker = t.pagination.dialogue.continued;
        breakPage();
        continue;
      }
      if (atTop()) {
        // Taller than a page and can't be split: print it and let it run over.
        emit([speech.cue(marker), ...body], 0);
        return;
      }
      breakPage();
    }
  };

  const placeLines = (
    block: Extract<Block, { kind: "lines" }>,
    next: Block | undefined,
  ): void => {
    let rows = block.rows;
    for (;;) {
      const space = spaceFor(block);
      const available = capacity - c.row - space;
      let needed = rows.length;
      if (block.isSceneHeading) {
        const nextSpace =
          next !== undefined && next.kind !== "page_break"
            ? next.spaceBefore
            : 0;
        const footprint = minimumFootprint(next, t);
        needed += footprint > 0 ? nextSpace + footprint : 0;
      }
      if (needed <= available) {
        emit(rows, space);
        return;
      }
      if (block.emptyLines === true) {
        // Empty lines that run past the foot of the page end there.
        breakPage();
        return;
      }
      if (block.splittable && available >= 1 && !atTop()) {
        emit(rows.slice(0, available), space);
        rows = rows.slice(available);
        breakPage();
        continue;
      }
      if (atTop()) {
        const fit = block.splittable ? Math.max(1, available) : rows.length;
        emit(rows.slice(0, fit), 0);
        rows = rows.slice(fit);
        if (rows.length === 0) return;
        breakPage();
        continue;
      }
      breakPage();
    }
  };

  blocks.forEach((block, i) => {
    if (block.kind === "page_break") {
      if (!atTop()) breakPage();
    } else if (block.kind === "lines" && block.emptyLines === true && atTop()) {
      // Space at the top of a page is dropped.
    } else if (block.kind === "speech") {
      placeSpeech(block.speech, block.spaceBefore);
    } else {
      placeLines(block, blocks[i + 1]);
    }
  });

  if (c.page.lines.length === 0 && c.pages.length > 1) c.pages.pop();
  c.pages.forEach((page, i) => {
    page.number = i + 1;
    page.lines.push(...pageNumberLines(g, i + 1));
  });

  const cover = titlePage(elements, g);
  return {
    width: t.page.width,
    height: t.page.height,
    font: { ...t.font },
    pages: cover === null ? c.pages : [cover, ...c.pages],
  };
}

function pageNumberLines(g: Geometry, n: number): PageLine[] {
  const t = g.template;
  const lines: PageLine[] = [];
  for (const [where, running] of [
    ["header", t.header],
    ["footer", t.footer],
  ] as const) {
    const number = running?.pageNumber;
    if (running == null || number == null || n < number.fromPage) continue;
    const spans = [{ text: number.format.replace("{page}", String(n)) }];
    const width = spanLength(spans) * g.charWidth;
    const x =
      number.align === "left"
        ? g.textLeft
        : number.align === "right"
          ? g.textLeft + g.textWidth - width
          : g.textLeft + (g.textWidth - width) / 2;
    const y =
      where === "header"
        ? running.offset
        : t.page.height - running.offset - t.font.lineHeight;
    lines.push({ x, y, spans, role: "page_number" });
  }
  return lines;
}
