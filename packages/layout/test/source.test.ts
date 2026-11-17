import { parse } from "@pagework/fountain";
import { resolveTemplate } from "@pagework/templates";
import { describe, expect, it } from "vitest";
import { paginate, type PageLine } from "../src/index.ts";
import { load } from "./fixtures.ts";

// The editor's page view draws page breaks and continuation markers at the
// places the paginator chose, so every printed line says which source line,
// and which column of that line's text, it starts at.

const short = resolveTemplate("test-short", load);
const us = resolveTemplate("screenplay-us", load);

function linesOf(source: string, template = us): PageLine[][] {
  return paginate(parse(source), template).pages.map((p) => p.lines);
}

function text(line: PageLine): string {
  return line.spans.map((s) => s.text).join("");
}

describe("source positions", () => {
  it("gives each element's line its source line", () => {
    const [page] = linesOf(
      "int. house - day\n\nRain.\nWind.\n\nTOM\n(quietly)\nHello.\n",
    );
    expect(
      page
        ?.filter((l) => l.role !== "page_number")
        .map((l) => [text(l), l.source]),
    ).toEqual([
      ["INT. HOUSE - DAY", { line: 1, column: 0 }],
      ["Rain.", { line: 3, column: 0 }],
      ["Wind.", { line: 4, column: 0 }],
      ["TOM", { line: 6, column: 0 }],
      ["(quietly)", { line: 7, column: 0 }],
      ["Hello.", { line: 8, column: 0 }],
    ]);
  });

  it("gives a wrapped line the column it starts at", () => {
    const words = Array.from({ length: 30 }, (_, i) => `w${String(i)}`).join(
      " ",
    );
    const [page] = linesOf(`Rain.\n\n${words}\n`);
    const rows = page?.filter((l) => l.role === "action") ?? [];
    expect(rows.length).toBeGreaterThanOrEqual(3);
    expect(rows.map((l) => l.source?.line)).toEqual([
      1,
      ...rows.slice(1).map(() => 3),
    ]);
    const second = rows[2];
    if (second === undefined) throw new Error("expected a wrapped line");
    expect(second.source?.column).toBe(words.indexOf(text(second)));
    expect(second.source?.column).toBeGreaterThan(0);
  });

  it("counts columns in the printed text, after markers and before case", () => {
    const xs = Array.from({ length: 30 }, (_, i) => `x${String(i)}`).join(" ");
    const [page] = linesOf(`!lower **bold** ${xs}\n`);
    const rows = page?.filter((l) => l.role === "action") ?? [];
    expect(rows[0]?.source).toEqual({ line: 1, column: 0 });
    // Columns count "lower bold ...", without the "!" and "**" markers.
    const printed = `lower bold ${xs}`;
    const second = rows[1];
    if (second === undefined) throw new Error("expected a wrapped line");
    expect(second.source?.column).toBe(printed.indexOf(text(second)));
  });

  it("leaves lines the paginator adds without a source", () => {
    const lines = Array.from(
      { length: 12 },
      (_, i) => `Line ${String(i + 1)}.`,
    );
    const pages = linesOf(`TOM\n${lines.join("\n")}\n`, short);
    const more = pages[0]?.find((l) => l.role === "more");
    expect(more).toBeDefined();
    expect(more?.source).toBeUndefined();
    const number = pages[1]?.find((l) => l.role === "page_number");
    expect(number?.source).toBeUndefined();
  });
});

describe("continuation markers on cues", () => {
  it("marks the repeated cue after a split speech", () => {
    const lines = Array.from(
      { length: 12 },
      (_, i) => `Line ${String(i + 1)}.`,
    );
    const pages = linesOf(`TOM\n${lines.join("\n")}\n`, short);
    const first = pages[0]?.find((l) => l.role === "character");
    const repeated = pages[1]?.find((l) => l.role === "character");
    expect(first?.marker).toBeUndefined();
    expect(repeated?.marker).toBe("(CONT'D)");
    expect(repeated?.source).toEqual({ line: 1, column: 0 });
    // The body carries on from the next source line, not the cue.
    const body = pages[1]?.find((l) => l.role === "dialogue");
    expect(body?.source?.line).toBeGreaterThan(1);
  });

  it("marks a cue continued after action", () => {
    const [page] = linesOf("TOM\nHi.\n\nHe waits.\n\nTOM\nStill here.\n");
    const cues = page?.filter((l) => l.role === "character") ?? [];
    expect(cues.map((c) => c.marker)).toEqual([undefined, "(CONT'D)"]);
    expect(cues[1]?.source).toEqual({ line: 6, column: 0 });
  });
});
