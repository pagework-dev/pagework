import type { Span } from "@pagework/fountain";
import type { PageModel } from "@pagework/layout";
import {
  PDFDocument,
  PDFHexString,
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
  type PDFRef,
} from "pdf-lib";
import { readFont, type FontInfo } from "./ttf.ts";
import { encodeWinAnsi, WIN_ANSI_TO_UNICODE } from "./winansi.ts";

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
  /** Characters the PDF couldn't show, printed as "?". Each listed once. */
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
 * Embeds a whole TrueType font as a simple font with WinAnsi encoding. This
 * avoids a font-subsetting dependency; the cost is Latin-1 coverage only and
 * the full font file (about 70 KB) in every PDF that uses the style.
 */
function embedFont(
  doc: PDFDocument,
  bytes: Uint8Array,
  info: FontInfo,
): PDFRef {
  const { context } = doc;
  const scale = (units: number): number =>
    Math.round((units * 1000) / info.unitsPerEm);
  const fontFile = context.register(
    context.flateStream(bytes, { Length1: bytes.length }),
  );
  const italic = info.italicAngle !== 0;
  // PDF 32000-1 §9.8.2: 1 = fixed pitch, 32 = non-symbolic, 64 = italic.
  const flags = (info.isFixedPitch ? 1 : 0) | 32 | (italic ? 64 : 0);
  const descriptor = context.register(
    context.obj({
      Type: "FontDescriptor",
      FontName: info.postScriptName,
      Flags: flags,
      FontBBox: info.bbox.map(scale),
      ItalicAngle: info.italicAngle,
      Ascent: scale(info.ascender),
      Descent: scale(info.descender),
      CapHeight: scale(info.capHeight),
      // StemV isn't in the font file; these are the usual estimates for
      // regular and bold weights, and viewers only use it for substitution.
      StemV: info.weightClass >= 600 ? 120 : 80,
      FontFile2: fontFile,
    }),
  );
  const widths: number[] = [];
  for (let code = 32; code <= 255; code++) {
    const unicode = WIN_ANSI_TO_UNICODE.get(code);
    widths.push(
      scale((unicode === undefined ? null : info.advanceOf(unicode)) ?? 0),
    );
  }
  return context.register(
    context.obj({
      Type: "Font",
      Subtype: "TrueType",
      BaseFont: info.postScriptName,
      FirstChar: 32,
      LastChar: 255,
      Widths: widths,
      Encoding: "WinAnsiEncoding",
      FontDescriptor: descriptor,
    }),
  );
}

/** Coordinates to 1/10 000 pt: far below what any printer resolves. */
function round(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function hex(bytes: number[]): string {
  return bytes
    .map((b) => b.toString(16).padStart(2, "0").toUpperCase())
    .join("");
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

  const info = new Map<Style, FontInfo>();
  const refs = new Map<Style, PDFRef>();
  const fontFor = (style: Style): { ref: PDFRef; info: FontInfo } => {
    let fontInfo = info.get(style);
    if (fontInfo === undefined) {
      fontInfo = readFont(options.fonts[style]);
      info.set(style, fontInfo);
    }
    let ref = refs.get(style);
    if (ref === undefined) {
      ref = embedFont(doc, options.fonts[style], fontInfo);
      refs.set(style, ref);
    }
    return { ref, info: fontInfo };
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
        const font = fontFor(style);
        used.add(style);
        const encoded = encodeWinAnsi(span.text);
        for (const ch of encoded.unencodable) unencodable.add(ch);
        page.pushOperators(
          beginText(),
          setFontAndSize(RESOURCE_NAMES[style], size),
          moveText(round(x), round(baseline)),
          showText(PDFHexString.of(hex(encoded.bytes))),
          endText(),
        );
        const width = encoded.bytes.length * advance * size;
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
        fontFor(style).ref,
      );
    }
  }

  const bytes = await doc.save();
  return { bytes, unencodable: [...unencodable] };
}
