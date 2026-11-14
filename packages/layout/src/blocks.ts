import type { Character, Element, Span } from "@pagework/fountain";
import type {
  ColumnStyle,
  ElementName,
  ElementStyle,
  Template,
} from "@pagework/templates";
import { characterWidth } from "./fonts.ts";
import type { LineRole } from "./model.ts";
import { spanLength, wrapSpans } from "./wrap.ts";

/** A printed line before it has a page and a vertical position. */
export interface Row {
  x: number;
  spans: Span[];
  role: LineRole;
}

/** Several lines printed side by side on one line (dual dialogue, scene numbers). */
export type RowGroup = Row[];

/** A speech: a cue and what is said, kept so it can be split across pages. */
export interface Speech {
  name: string;
  /** Builds the cue, with a continuation marker after it or none. */
  cue: (marker: string | null) => RowGroup;
  /** The character-continued marker, if this speech follows the same speaker. */
  marker: string | null;
  body: RowGroup[];
  more: RowGroup;
}

export type Block =
  | { kind: "page_break" }
  | {
      kind: "lines";
      /** Scene heading, transition, centred text and dual dialogue never split. */
      splittable: boolean;
      isSceneHeading: boolean;
      spaceBefore: number;
      rows: RowGroup[];
    }
  | { kind: "speech"; spaceBefore: number; speech: Speech };

export interface Geometry {
  template: Template;
  charWidth: number;
  textLeft: number;
  textWidth: number;
}

export function geometry(template: Template): Geometry {
  const { page } = template;
  return {
    template,
    charWidth: characterWidth(template.font.family, template.font.size),
    textLeft: page.margin.left,
    textWidth: page.width - page.margin.left - page.margin.right,
  };
}

function styleOf(g: Geometry, name: ElementName): ElementStyle {
  const style = g.template.elements[name];
  if (style === undefined)
    throw new Error(`Template "${g.template.id}" has no ${name} element`);
  return style;
}

/** Applies an element's case, wrapping text, prefix, suffix and emphasis. */
function styleSpans(style: ElementStyle, content: readonly Span[]): Span[] {
  let spans = content.map((s) => ({ ...s }));
  if (style.case === "upper")
    spans = spans.map((s) => ({ ...s, text: s.text.toUpperCase() }));
  const text = spans.map((s) => s.text).join("");
  if (style.wrap === "parentheses" && !text.startsWith("("))
    spans = [{ text: "(" }, ...spans, { text: ")" }];
  if (style.wrap === "brackets" && !text.startsWith("["))
    spans = [{ text: "[" }, ...spans, { text: "]" }];
  if (style.prefix !== "") spans.unshift({ text: style.prefix });
  if (style.suffix !== "") spans.push({ text: style.suffix });
  for (const flag of style.style) {
    for (const span of spans) span[flag] = true;
  }
  return spans;
}

/** Lays out one element's text in a box, one row group per printed line. */
function boxRows(
  g: Geometry,
  style: ElementStyle,
  box: { left: number; width: number },
  content: readonly Span[],
  role: LineRole,
): RowGroup[] {
  const left = box.left + style.indent;
  const width = style.width ?? box.width - style.indent;
  const max = Math.floor(width / g.charWidth + 1e-9);
  return wrapSpans(styleSpans(style, content), max).map((spans) => {
    const used = spanLength(spans) * g.charWidth;
    const x =
      style.align === "right"
        ? left + width - used
        : style.align === "center"
          ? left + (width - used) / 2
          : left;
    return [{ x, spans, role }];
  });
}

function elementRows(
  g: Geometry,
  name: ElementName,
  content: readonly Span[],
  role: LineRole,
): RowGroup[] {
  return boxRows(
    g,
    styleOf(g, name),
    { left: g.textLeft, width: g.textWidth },
    content,
    role,
  );
}

function cueSpans(character: Character, continuedText: string | null): Span[] {
  const extensions = character.extensions.map((e) => ` (${e})`).join("");
  const rest = `${extensions}${continuedText === null ? "" : ` ${continuedText}`}`;
  return [{ text: `${character.name}${rest}` }];
}

type SpeechPart = Extract<
  Element,
  { type: "dialogue" | "parenthetical" | "lyrics" }
>;

function speechBody(
  g: Geometry,
  parts: SpeechPart[],
  box: (name: ElementName) => {
    left: number;
    width: number;
    style: ElementStyle;
  },
): RowGroup[] {
  return parts.flatMap((part) => {
    const { left, width, style } = box(part.type);
    return boxRows(g, style, { left, width }, part.content, part.type);
  });
}

function speech(
  g: Geometry,
  character: Character,
  parts: SpeechPart[],
  marker: string | null,
): Speech {
  const t = g.template;
  const cueStyle = styleOf(g, "character");
  const full = (
    name: ElementName,
  ): { left: number; width: number; style: ElementStyle } => ({
    left: g.textLeft,
    width: g.textWidth,
    style: styleOf(g, name),
  });
  // The cue's case applies to the name only: extensions keep the writer's
  // case, as in the Fountain guide's "HANS (on the radio)".
  const nameStyle: ElementStyle = { ...cueStyle, case: "as-written" };
  const cue = (cueMarker: string | null): RowGroup => {
    const spans = cueSpans(
      {
        ...character,
        name:
          cueStyle.case === "upper"
            ? character.name.toUpperCase()
            : character.name,
      },
      cueMarker,
    );
    return (
      boxRows(
        g,
        nameStyle,
        { left: g.textLeft, width: g.textWidth },
        spans,
        "character",
      )[0] ?? []
    );
  };
  return {
    name: character.name.toUpperCase(),
    marker,
    cue,
    body: speechBody(g, parts, full),
    more:
      boxRows(
        g,
        nameStyle,
        { left: g.textLeft, width: g.textWidth },
        [{ text: t.pagination.dialogue.more }],
        "more",
      )[0] ?? [],
  };
}

function columnRows(
  g: Geometry,
  character: Character,
  parts: SpeechPart[],
  columnLeft: number,
  columnWidth: number,
): RowGroup[] {
  const dual = g.template.dualDialogue;
  if (dual === null) return [];
  const column = (
    style: ColumnStyle,
    name: ElementName,
  ): { left: number; width: number; style: ElementStyle } => ({
    left: columnLeft,
    width: columnWidth,
    style: {
      ...styleOf(g, name),
      indent: style.indent,
      width: style.width,
      align: "left",
    },
  });
  const cueBox = column(dual.character, "character");
  const cue = boxRows(
    g,
    { ...cueBox.style, case: "as-written" },
    cueBox,
    cueSpans(
      {
        ...character,
        name:
          styleOf(g, "character").case === "upper"
            ? character.name.toUpperCase()
            : character.name,
      },
      null,
    ),
    "character",
  );
  const body = speechBody(g, parts, (name) =>
    column(
      name === "parenthetical"
        ? dual.parenthetical
        : name === "lyrics"
          ? dual.lyrics
          : dual.dialogue,
      name,
    ),
  );
  return [...cue, ...body];
}

function dualRows(
  g: Geometry,
  left: { character: Character; parts: SpeechPart[] },
  right: { character: Character; parts: SpeechPart[] },
): RowGroup[] {
  const dual = g.template.dualDialogue;
  if (dual === null) return [];
  const areaLeft = g.textLeft + dual.indent;
  const areaWidth = dual.width ?? g.textWidth - dual.indent;
  const columnWidth = (areaWidth - dual.gap) / 2;
  const a = columnRows(g, left.character, left.parts, areaLeft, columnWidth);
  const b = columnRows(
    g,
    right.character,
    right.parts,
    areaLeft + columnWidth + dual.gap,
    columnWidth,
  );
  return Array.from({ length: Math.max(a.length, b.length) }, (_, i) => [
    ...(a[i] ?? []),
    ...(b[i] ?? []),
  ]);
}

const SILENT = new Set([
  "title_page",
  "section",
  "synopsis",
  "note",
  "boneyard",
]);

function sceneNumberRows(g: Geometry, number: string): Row[] {
  const where = g.template.pagination.sceneNumbers;
  const spans = [{ text: number }];
  const rows: Row[] = [];
  if (where === "left" || where === "both")
    rows.push({ x: g.template.sceneNumber.left, spans, role: "scene_number" });
  if (where === "right" || where === "both") {
    rows.push({
      x: g.template.sceneNumber.right - number.length * g.charWidth,
      spans,
      role: "scene_number",
    });
  }
  return rows;
}

/**
 * Turns the element list into printable blocks, deciding everything that
 * doesn't depend on where pages break: wrapping, case, scene numbers and
 * the character-continued (CONT'D) rule.
 */
export function buildBlocks(
  elements: readonly Element[],
  g: Geometry,
): Block[] {
  const t = g.template;
  const printed = elements.filter((e) => !SILENT.has(e.type));
  const blocks: Block[] = [];
  let sceneCount = 0;
  // Character continued (ADR 0011, kind 2): the same character speaks again
  // with only action between, within one scene.
  let lastSpeaker: string | null = null;
  let actionSinceSpeech = false;

  const takeSpeech = (start: number): { parts: SpeechPart[]; next: number } => {
    const parts: SpeechPart[] = [];
    let i = start;
    for (; i < printed.length; i++) {
      const el = printed[i];
      if (
        el?.type === "dialogue" ||
        el?.type === "parenthetical" ||
        el?.type === "lyrics"
      )
        parts.push(el);
      else break;
    }
    return { parts, next: i };
  };

  for (let i = 0; i < printed.length; i++) {
    const el = printed[i];
    if (el === undefined) break;
    switch (el.type) {
      case "page_break":
        blocks.push({ kind: "page_break" });
        break;
      case "scene_heading": {
        sceneCount++;
        lastSpeaker = null;
        const rows = elementRows(
          g,
          "scene_heading",
          el.content,
          "scene_heading",
        );
        if (t.pagination.sceneNumbers !== "none") {
          rows[0]?.push(
            ...sceneNumberRows(g, el.sceneNumber ?? String(sceneCount)),
          );
        }
        blocks.push({
          kind: "lines",
          splittable: false,
          isSceneHeading: true,
          spaceBefore: styleOf(g, "scene_heading").spaceBefore,
          rows,
        });
        break;
      }
      case "action":
      case "lyrics":
      case "dialogue":
      case "parenthetical": {
        // Speech parts without a cue are printed on their own.
        if (el.type === "action") actionSinceSpeech = true;
        blocks.push({
          kind: "lines",
          splittable: true,
          isSceneHeading: false,
          spaceBefore: styleOf(g, el.type).spaceBefore,
          rows: elementRows(g, el.type, el.content, el.type),
        });
        break;
      }
      case "transition":
      case "centered":
        lastSpeaker = el.type === "transition" ? null : lastSpeaker;
        blocks.push({
          kind: "lines",
          splittable: false,
          isSceneHeading: false,
          spaceBefore: styleOf(g, el.type).spaceBefore,
          rows: elementRows(g, el.type, el.content, el.type),
        });
        break;
      case "character": {
        const { parts, next } = takeSpeech(i + 1);
        const partner = printed[next];
        if (
          el.dual === "left" &&
          partner?.type === "character" &&
          partner.dual === "right" &&
          t.dualDialogue !== null
        ) {
          const second = takeSpeech(next + 1);
          blocks.push({
            kind: "lines",
            splittable: false,
            isSceneHeading: false,
            spaceBefore: t.dualDialogue.spaceBefore,
            rows: dualRows(
              g,
              { character: el, parts },
              { character: partner, parts: second.parts },
            ),
          });
          lastSpeaker = null;
          i = second.next - 1;
          break;
        }
        const name = el.name.toUpperCase();
        const continued =
          t.pagination.characterContinued.enabled &&
          lastSpeaker === name &&
          actionSinceSpeech;
        blocks.push({
          kind: "speech",
          spaceBefore: styleOf(g, "character").spaceBefore,
          speech: speech(
            g,
            el,
            parts,
            continued ? t.pagination.characterContinued.text : null,
          ),
        });
        lastSpeaker = name;
        actionSinceSpeech = false;
        i = next - 1;
        break;
      }
      default:
        break;
    }
  }
  return blocks;
}
