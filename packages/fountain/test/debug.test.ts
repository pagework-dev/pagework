import { describe, expect, it } from "vitest";
import { formatLineTypes, lineTypes } from "../src/index.ts";

describe("lineTypes", () => {
  it("labels every source line, including blanks and forced elements", () => {
    const source = "INT. HOUSE - DAY #4#\n\n@McCLANE\nHello.\n\n!BANG";
    expect(lineTypes(source).map((r) => r.type)).toEqual([
      "scene_heading (#4)",
      "blank",
      "character (forced)",
      "dialogue",
      "blank",
      "action (forced)",
    ]);
  });

  it("formats rows in aligned columns", () => {
    expect(formatLineTypes(lineTypes("BRICK\nHi.\n"))).toBe(
      "1  character  | BRICK\n2  dialogue   | Hi.",
    );
  });
});
