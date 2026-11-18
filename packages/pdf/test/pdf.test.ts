import { characterWidth, type PageModel } from "@pagework/layout";
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFRawStream,
  PDFRef,
  decodePDFRawStream,
} from "pdf-lib";
import { describe, expect, it } from "vitest";
import { renderPdf } from "../src/index.ts";
import { readFont } from "../src/ttf.ts";
import { fonts } from "./fonts.ts";

const model: PageModel = {
  width: 612,
  height: 792,
  font: { family: "Courier Prime", size: 12, lineHeight: 12 },
  pages: [
    {
      kind: "script",
      number: 1,
      lines: [
        {
          x: 108,
          y: 72,
          spans: [{ text: "INT. KITCHEN - NIGHT" }],
          role: "scene_heading",
        },
        {
          x: 108,
          y: 96,
          spans: [
            { text: "Plain " },
            { text: "bold", bold: true },
            { text: " and " },
            { text: "it’s", italic: true, underline: true },
          ],
          role: "action",
        },
      ],
    },
    {
      kind: "script",
      number: 2,
      lines: [
        { x: 108, y: 72, spans: [{ text: "Page two." }], role: "action" },
      ],
    },
  ],
};

function latin1(bytes: Uint8Array): string {
  let text = "";
  for (const byte of bytes) text += String.fromCharCode(byte);
  return text;
}

async function contentOf(
  bytes: Uint8Array,
  pageIndex: number,
): Promise<string> {
  const doc = await PDFDocument.load(bytes);
  const contents = doc.getPage(pageIndex).node.Contents();
  // A page's content is one stream or an array of them.
  const items =
    contents instanceof PDFArray
      ? contents.asArray()
      : contents === undefined
        ? []
        : [contents];
  return items
    .map((item) => (item instanceof PDFRef ? doc.context.lookup(item) : item))
    .map((s) =>
      s instanceof PDFRawStream ? latin1(decodePDFRawStream(s).decode()) : "",
    )
    .join("\n");
}

describe("Courier Prime font files", () => {
  it.each(Object.keys(fonts) as (keyof typeof fonts)[])(
    "%s is monospaced with the advance layout uses",
    (style) => {
      const info = readFont(fonts[style]);
      expect(info.isFixedPitch).toBe(true);
      for (let c = 32; c < 127; c++) {
        expect((info.advanceOf(c) ?? 0) / info.unitsPerEm).toBeCloseTo(
          characterWidth("Courier Prime", 1),
          10,
        );
      }
    },
  );
});

describe("renderPdf", () => {
  it("writes one PDF page per model page at the model's size", async () => {
    const { bytes } = await renderPdf(model, { fonts });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(2);
    expect(doc.getPage(0).getSize()).toEqual({ width: 612, height: 792 });
  });

  it("embeds only the styles used, each as a subset of Courier Prime", async () => {
    const { bytes } = await renderPdf(model, { fonts });
    const doc = await PDFDocument.load(bytes);
    const resources = doc.getPage(0).node.Resources();
    const fontDict = resources?.lookup(PDFName.of("Font"), PDFDict);
    const names = (fontDict?.keys() ?? []).map((key) => {
      const font = fontDict?.lookup(key, PDFDict);
      expect(font?.get(PDFName.of("ToUnicode"))).toBeInstanceOf(PDFRef);
      const descendant = font
        ?.lookup(PDFName.of("DescendantFonts"), PDFArray)
        .lookup(0, PDFDict);
      const descriptor = descendant?.lookup(
        PDFName.of("FontDescriptor"),
        PDFDict,
      );
      expect(descriptor?.get(PDFName.of("FontFile2"))).toBeInstanceOf(PDFRef);
      return font?.get(PDFName.of("BaseFont"))?.toString();
    });
    // Fixed subset tags (not random ones) keep the output repeatable.
    expect(names.sort()).toEqual([
      "/PWBOLD+CourierPrime-Bold",
      "/PWITAL+CourierPrime-Italic",
      "/PWREGU+CourierPrime-Regular",
    ]);
  });

  it("embeds only the glyphs used, so a page is small", async () => {
    const { bytes } = await renderPdf(model, { fonts });
    expect(bytes.length).toBeLessThan(40_000);
  });

  it("places text at the model's positions, measured from the top edge", async () => {
    const { bytes } = await renderPdf(model, { fonts });
    const content = await contentOf(bytes, 0);
    // Baseline sits ascender / (ascender - descender) of the way down the line.
    const baseline = 792 - (72 + (12 * 1600) / 2300);
    expect(content).toContain(
      `108 ${baseline.toFixed(4).replace(/\.?0+$/, "")} Td`,
    );
    // Text is shown as glyph numbers of the subset font.
    expect(content).toMatch(/<[0-9A-F]{4,}> Tj/);
  });

  it("draws underlines as filled rectangles", async () => {
    const content = await contentOf(
      (await renderPdf(model, { fonts })).bytes,
      0,
    );
    expect(content).toMatch(/ re\s+f/);
  });

  it("is byte-for-byte repeatable", async () => {
    const a = await renderPdf(model, { fonts, title: "The Kettle" });
    const b = await renderPdf(model, { fonts, title: "The Kettle" });
    expect(a.bytes).toEqual(b.bytes);
  });

  it("prints letters beyond Windows-1252 that Courier Prime has", async () => {
    const wide: PageModel = {
      ...model,
      pages: [
        {
          kind: "script",
          number: 1,
          lines: [
            {
              x: 0,
              y: 0,
              spans: [{ text: "Łódź, Brașov — “ok”" }],
              role: "action",
            },
          ],
        },
      ],
    };
    expect((await renderPdf(wide, { fonts })).unencodable).toEqual([]);
  });

  it("reports characters Courier Prime doesn't have and prints them as ?", async () => {
    const odd: PageModel = {
      ...model,
      pages: [
        {
          kind: "script",
          number: 1,
          lines: [{ x: 0, y: 0, spans: [{ text: "日本Ж" }], role: "action" }],
        },
      ],
    };
    const result = await renderPdf(odd, { fonts });
    expect(result.unencodable).toEqual(["日", "本", "Ж"]);
    const question = await renderPdf(
      {
        ...odd,
        pages: [
          {
            kind: "script",
            number: 1,
            lines: [{ x: 0, y: 0, spans: [{ text: "???" }], role: "action" }],
          },
        ],
      },
      { fonts },
    );
    expect(await contentOf(result.bytes, 0)).toBe(
      await contentOf(question.bytes, 0),
    );
  });
});
