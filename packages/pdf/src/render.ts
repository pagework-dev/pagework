import type { Span } from "@pagework/fountain";
import type { PageModel } from "@pagework/layout";
import fontkit from "@pdf-lib/fontkit";
import {
  PDFDocument,
  PDFName,
  beginText,
  endText,
  fill,
  moveText,
  popGraphicsState,
  pushGraphicsState,
  rectangle,
  setFontAndSize,
  showText,
  type PDFFont,
} from "pdf-lib";
import { readFont, type FontInfo } from "./ttf.ts";

/** The four Courier Prime font files, as bytes. */
export interface CourierPrime {
  regular: Uint8Array;
  bold: Uint8Array;
  italic: Uint8Array;
  boldItalic: Uint8Array;
}

/** File names in packages/pdf/fonts, for callers that load them from disk. */
export const FONT_FILES = {
  regular: "CourierPrime-Regular.ttf",
  bold: "CourierPrime-Bold.ttf",
  italic: "CourierPrime-Italic.ttf",
  boldItalic: "CourierPrime-BoldItalic.ttf",
} as const satisfies Record<keyof CourierPrime, string>;

export interface PdfOptions {
  fonts: CourierPrime;
  /** Document title in the PDF's properties. */
  title?: string;
}

export interface PdfResult {
  bytes: Uint8Array;
  /** Characters Courier Prime doesn't have, printed as "?". Each listed once. */
  unencodable: string[];
}

type Style = keyof CourierPrime;

function styleOf(span: Span): Style {
  if (span.bold === true && span.italic === true) return "boldItalic";
  if (span.bold === true) return "bold";
  if (span.italic === true) return "italic";
  return "regular";
}

const RESOURCE_NAMES: Record<Style, string> = {
  regular: "F1",
  bold: "F2",
  italic: "F3",
  boldItalic: "F4",
};

/**
 * Subset fonts are named with a six-letter tag (PDF 32000-1 §9.6.4).
 * pdf-lib would pick a random one; fixed tags keep the output repeatable.
 */
const SUBSET_TAGS: Record<Style, string> = {
  regular: "PWREGU",
  bold: "PWBOLD",
  italic: "PWITAL",
  boldItalic: "PWBOIT",
};

/** Coordinates to 1/10 000 pt: far below what any printer resolves. */
function round(value: number): number {
  return Math.round(value * 10000) / 10000;
}

/** Renders a page model to PDF. Runs in Node and the browser. */
export async function renderPdf(
  model: PageModel,
  options: PdfOptions,
): Promise<PdfResult> {
  if (model.font.family !== "Courier Prime") {
    throw new Error(
      `The PDF renderer only has Courier Prime, not "${model.font.family}"`,
    );
  }
  // No creation or modification dates, so the same script gives the same bytes.
  const doc = await PDFDocument.create({ updateMetadata: false });
  doc.setProducer("Pagework");
  doc.setCreator("Pagework");
  if (options.title !== undefined) doc.setTitle(options.title);

  doc.registerFontkit(fontkit);
  const info = new Map<Style, FontInfo>();
  const embedded = new Map<Style, PDFFont>();
  // Only the glyphs a script uses are embedded (fontkit subsetting), so any
  // character Courier Prime has can print, not just Windows-1252.
  const fontFor = async (
    style: Style,
  ): Promise<{ font: PDFFont; info: FontInfo }> => {
    let fontInfo = info.get(style);
    if (fontInfo === undefined) {
      fontInfo = readFont(options.fonts[style]);
      info.set(style, fontInfo);
    }
    let font = embedded.get(style);
    if (font === undefined) {
      font = await doc.embedFont(options.fonts[style], {
        subset: true,
        customName: `${SUBSET_TAGS[style]}+${fontInfo.postScriptName}`,
      });
      embedded.set(style, font);
    }
    return { font, info: fontInfo };
  };
  const characters = new Map<Style, Set<number>>();
  const printable = async (style: Style, text: string): Promise<string> => {
    let set = characters.get(style);
    if (set === undefined) {
      set = new Set((await fontFor(style)).font.getCharacterSet());
      characters.set(style, set);
    }
    let out = "";
    for (const ch of text) {
      if (set.has(ch.codePointAt(0) ?? 0)) {
        out += ch;
      } else {
        unencodable.add(ch);
        out += "?";
      }
    }
    return out;
  };

  const regular = readFont(options.fonts.regular);
  const size = model.font.size;
  const advance = (regular.advanceOf(0x20) ?? 0) / regular.unitsPerEm;
  // Put the baseline where the font's ascender and descender split the line,
  // so each line's glyphs stay inside its own line slot.
  const baselineOffset =
    (model.font.lineHeight * regular.ascender) /
    (regular.ascender - regular.descender);
  const unencodable = new Set<string>();

  for (const pageModel of model.pages) {
    const page = doc.addPage([model.width, model.height]);
    const used = new Set<Style>();
    for (const line of pageModel.lines) {
      let x = line.x;
      const baseline = model.height - (line.y + baselineOffset);
      for (const span of line.spans) {
        if (span.text === "") continue;
        const style = styleOf(span);
        const font = await fontFor(style);
        used.add(style);
        const text = await printable(style, span.text);
        page.pushOperators(
          beginText(),
          setFontAndSize(RESOURCE_NAMES[style], size),
          moveText(round(x), round(baseline)),
          showText(font.font.encodeText(text)),
          endText(),
        );
        const width = [...text].length * advance * size;
        if (span.underline === true) {
          const position =
            (font.info.underlinePosition / font.info.unitsPerEm) * size;
          const thickness =
            (font.info.underlineThickness / font.info.unitsPerEm) * size;
          page.pushOperators(
            pushGraphicsState(),
            rectangle(
              round(x),
              round(baseline + position - thickness / 2),
              round(width),
              round(thickness),
            ),
            fill(),
            popGraphicsState(),
          );
        }
        x += width;
      }
    }
    for (const style of used) {
      page.node.setFontDictionary(
        PDFName.of(RESOURCE_NAMES[style]),
        (await fontFor(style)).font.ref,
      );
    }
  }

  const bytes = await doc.save();
  return { bytes, unencodable: [...unencodable] };
}
