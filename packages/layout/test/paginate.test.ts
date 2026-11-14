import { parse } from "@pagework/fountain";
import { resolveTemplate } from "@pagework/templates";
import { describe, expect, it } from "vitest";
import { paginate, renderText } from "../src/index.ts";
import { wrapText } from "../src/wrap.ts";
import { load } from "./fixtures.ts";

const short = resolveTemplate("test-short", load);

function pagesOf(source: string): string[] {
  return renderText(paginate(parse(source), short))
    .split(/^=== /m)
    .filter((p) => p !== "");
}

describe("wrapText", () => {
  it("breaks at the last space that fits", () => {
    expect(wrapText("aaa bbb ccc", 7)).toEqual([
      [0, 7],
      [8, 11],
    ]);
  });

  it("breaks a word longer than the line", () => {
    expect(wrapText("abcdefghij", 4)).toEqual([
      [0, 4],
      [4, 8],
      [8, 10],
    ]);
  });

  it("keeps hard line breaks and does not break inside a leading indent", () => {
    expect(wrapText("    abcdef\nxy", 6)).toEqual([
      [0, 6],
      [6, 10],
      [11, 13],
    ]);
  });
});

describe("paginate", () => {
  it("splits a speech longer than a page over several pages", () => {
    const lines = Array.from(
      { length: 20 },
      (_, i) => `Line ${String(i + 1)}.`,
    );
    const pages = pagesOf(`TOM\n${lines.join("\n")}`);
    expect(pages).toHaveLength(3);
    expect(pages[0]).toContain("(MORE)");
    expect(pages[1]).toMatch(/TOM \(CONT'D\)[\s\S]*\(MORE\)/);
    expect(pages[2]).toContain("TOM (CONT'D)");
    expect(pages[2]).toContain("Line 20.");
  });

  it("never leaves a parenthetical as the last line before (MORE)", () => {
    const source =
      "A.\n\nB.\n\nTOM\nOne.\nTwo.\nThree.\n(beat)\nFour.\nFive.\nSix.";
    const [first = "", second = ""] = pagesOf(source);
    expect(first).not.toMatch(/\(beat\)\n\d\d\| +\(MORE\)/);
    expect(second).toContain("(beat)");
  });

  it("moves a speech whole when the template turns splitting off", () => {
    const noSplit = {
      ...short,
      pagination: {
        ...short.pagination,
        dialogue: { ...short.pagination.dialogue, split: false },
      },
    };
    const lines = Array.from(
      { length: 5 },
      (_, i) => `Line ${String(i + 1)}.`,
    ).join("\n");
    const text = renderText(
      paginate(parse(`One.\n\nTwo.\n\nTOM\n${lines}`), noSplit),
    );
    expect(text).not.toContain("(MORE)");
    expect(text).toMatch(/=== page 2 ===\n03\|.*\n06\| +TOM\n/);
  });

  it("does not start a page with blank lines or end with an empty page", () => {
    const text = renderText(
      paginate(parse("One.\n\n===\n\n===\n\nTwo.\n\n===\n"), short),
    );
    expect(text).toBe(
      "=== page 1 ===\n06|               One.\n=== page 2 ===\n03|                                                                         2.\n06|               Two.\n",
    );
  });

  it("never prints notes, synopses, sections or boneyard", () => {
    const text = renderText(
      paginate(
        parse("# Act\n\n= Synopsis\n\n[[note]]\n\n/* gone */\n\nShown."),
        short,
      ),
    );
    expect(text).toBe("=== page 1 ===\n06|               Shown.\n");
  });

  it("rejects a base template", () => {
    expect(() => paginate([], { ...short, abstract: true })).toThrow(
      /base template/,
    );
  });
});
