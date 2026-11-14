/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { removeContinuationMarkers } from "../src/index.ts";

const source = import.meta.glob<string>("../../../fixtures/fountain/continuation-markers.fountain", {
  query: "?raw",
  import: "default",
  eager: true,
});

describe("removeContinuationMarkers (ADR 0011)", () => {
  it("removes typed markers of all three kinds and keeps content extensions", () => {
    const input = Object.values(source)[0] ?? "";
    const { text, removed } = removeContinuationMarkers(input);
    expect(text).toBe(
      [
        "INT. HALL - DAY",
        "",
        "TOM",
        "I was saying something",
        "",
        "TOM",
        "and then I carried on.",
        "",
        "TOM (V.O.)",
        "Still talking.",
        "",
        "ANNA",
        "Me too.",
        "",
        "BEN",
        "And me.",
        "",
        "CAL",
        "Last.",
        "",
        "DOT (O.S.)",
        "CONTINUED: (2)",
        "",
      ].join("\n"),
    );
    expect(removed).toEqual([
      { line: 5, marker: "(MORE)" },
      { line: 7, marker: "(CONT'D)" },
      { line: 10, marker: "CONTINUED:" },
      { line: 12, marker: "(CONT’D)" },
      { line: 15, marker: "(CONTINUED)" },
      { line: 17, marker: "(CONTD)" },
      { line: 20, marker: "(cont.)" },
      { line: 23, marker: "(continued)" },
    ]);
  });

  it("leaves a script without markers unchanged", () => {
    const plain = "INT. HALL - DAY\n\nTOM (V.O.)\nHello.\n";
    expect(removeContinuationMarkers(plain)).toEqual({ text: plain, removed: [] });
  });

  it("is idempotent", () => {
    const once = removeContinuationMarkers("TOM (CONT'D)\nHi.\n(MORE)\n").text;
    expect(removeContinuationMarkers(once).text).toBe(once);
  });
});
