import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { exportPdf } from "../src/export.ts";
import { decodeGreyPng, differingShare } from "./png.ts";

// ARCHITECTURE.md, Testing: rendered PDF pages compared to reference images
// with a small tolerance. Needs poppler's pdftoppm (CI installs
// poppler-utils). The byte-for-byte test catches any change; this one says
// whether a change can be seen, and where.

const root = join(import.meta.dirname, "../../..");
const references = join(root, "fixtures/pdf-images");
const work = mkdtempSync(join(tmpdir(), "pagework-images-"));
afterAll(() => {
  rmSync(work, { recursive: true, force: true });
});

/** Rasterises a PDF at 50 dpi in grey, one PNG per page, in page order. */
export function rasterise(pdf: string, prefix: string): string[] {
  execFileSync("pdftoppm", ["-r", "50", "-png", pdf, prefix]);
  const dir = join(prefix, "..");
  const name = prefix.slice(dir.length + 1);
  return readdirSync(dir)
    .filter((f) => f.startsWith(`${name}-`) && f.endsWith(".png"))
    .sort()
    .map((f) => join(dir, f));
}

describe("rendered sample pages", () => {
  it.each(["screenplay-us", "screenplay-a4"])(
    "match the reference images for %s",
    async (template) => {
      const pdf = join(work, `${template}.pdf`);
      await exportPdf(
        join(root, "fixtures/sample-script.fountain"),
        template,
        pdf,
      );
      const pages = rasterise(pdf, join(work, template));
      const expected = readdirSync(references)
        .filter((f) => f.startsWith(`sample-script.${template}-`))
        .sort();
      expect(pages.map((p) => p.slice(p.lastIndexOf("-")))).toEqual(
        expected.map((f) => f.slice(f.lastIndexOf("-"))),
      );
      pages.forEach((page, i) => {
        const actual = decodeGreyPng(readFileSync(page));
        const reference = decodeGreyPng(
          readFileSync(join(references, expected[i] ?? "")),
        );
        expect(differingShare(actual, reference), expected[i]).toBeLessThan(
          0.002,
        );
      });
    },
  );

  it("notices a page that has changed", () => {
    const [first, second] = readdirSync(references)
      .filter((f) => f.startsWith("sample-script.screenplay-us-"))
      .sort()
      .map((f) => decodeGreyPng(readFileSync(join(references, f))));
    if (first === undefined || second === undefined)
      throw new Error("missing reference images");
    expect(differingShare(first, second)).toBeGreaterThan(0.002);
  });
});
