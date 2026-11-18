import { describe, expect, it } from "vitest";
import { inlineMarks } from "../src/index.ts";

// The editor hides emphasis markers and shows the emphasis instead, so it
// needs their positions in the source line, not just the resulting spans.

describe("inlineMarks", () => {
  it("finds emphasis markers and the text they style", () => {
    expect(inlineMarks("a *b* **c** ***d*** _e_")).toEqual({
      hidden: [2, 4, 6, 7, 9, 10, 12, 13, 14, 16, 17, 18, 20, 22],
      styled: [
        { from: 3, to: 4, italic: true },
        { from: 8, to: 9, bold: true },
        { from: 15, to: 16, bold: true, italic: true },
        { from: 21, to: 22, underline: true },
      ],
    });
  });

  it("hides escaping backslashes and leaves unmatched markers as text", () => {
    expect(inlineMarks("\\*not\\* *69 and a_b")).toEqual({
      hidden: [0, 5],
      styled: [],
    });
  });

  it("nests styles", () => {
    expect(inlineMarks("_*x*_")).toEqual({
      hidden: [0, 1, 3, 4],
      styled: [{ from: 2, to: 3, italic: true, underline: true }],
    });
  });
});
