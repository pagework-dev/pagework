/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import {
  parse,
  parseScript,
  updateScript,
  type ParsedScript,
  type TextEdit,
} from "../src/index.ts";
import { generateScript, pick, random } from "./generate.ts";

// Fuzzing and exhaustive edits: seconds on a slow CI machine, more than
// vitest's default 5 s limit. The time limit changes nothing they check.
const SLOW_TEST_MS = 60_000;

// The rule these tests enforce: after any edit, the incremental result is
// exactly what a full parse of the new text gives. They never compare the
// incremental parser with itself.

const fixtures = import.meta.glob<string>(
  ["../../../fixtures/fountain/*.fountain", "../../../fixtures/*.fountain"],
  { query: "?raw", import: "default", eager: true },
);

function apply(prev: ParsedScript, edit: TextEdit): ParsedScript {
  const next = updateScript(prev, edit);
  const expected =
    prev.source.slice(0, edit.from) + edit.insert + prev.source.slice(edit.to);
  expect(next.source).toBe(expected);
  expect(next.lines).toEqual(expected.split("\n"));
  expect(next.elements).toEqual(parse(expected));
  return next;
}

/** Lines that exercise every rule with context: cues, `^`, notes, boneyard, markers. */
const VOCABULARY = [
  "",
  "",
  "",
  "  ",
  "INT. KITCHEN - NIGHT",
  "EXT. SEA WALL - DAY #4#",
  ".forced heading",
  "Rain on the glass.",
  "!ALL CAPS ACTION",
  "\tIndented with a tab.",
  "TOM",
  "MARGUERITE (V.O.)",
  "DEV ^",
  "@McCRAE",
  "(quietly)",
  "You said six.",
  "~Sing it low",
  "CUT TO:",
  "> FADE OUT.",
  ">THE END<",
  "===",
  "# Act one",
  "= She finds the map.",
  "[[a note on its own line]]",
  "A line with [[an inline note]] in it.",
  "[[a note that",
  "runs over two lines]]",
  "/* boneyard */",
  "/* opens a boneyard",
  "closes it */",
  "(MORE)",
  "CONTINUED:",
  "TOM (CONT'D)",
  "Title: The Long Tide",
  "Author: Someone",
  "    indented continuation",
  "*bold* and _underlined_",
];

const INSERTS = [
  "x",
  " ",
  "\n",
  "\n\n",
  "^",
  "(",
  ")",
  "@",
  ".",
  "!",
  ">",
  "<",
  "~",
  "TOM",
  "INT. ",
  "\nTOM\nHello.\n",
  "\n\nEXT. ROAD - DAY\n\n",
  "[[",
  "]]",
  "/*",
  "*/",
  "  ",
  "#",
  "=",
  "Title: X\n",
  "(MORE)",
];

function randomEdit(
  next: () => number,
  source: string,
  inserts: readonly string[] = INSERTS,
): TextEdit {
  const a = Math.floor(next() * (source.length + 1));
  const kind = next();
  if (kind < 0.45) return { from: a, to: a, insert: pick(next, inserts) };
  const span = Math.floor(next() * (next() < 0.8 ? 4 : 60));
  const to = Math.min(source.length, a + span);
  if (kind < 0.8) return { from: a, to, insert: "" };
  return { from: a, to, insert: pick(next, inserts) };
}

function randomScript(
  next: () => number,
  vocabulary: readonly string[] = VOCABULARY,
): string {
  const count = 5 + Math.floor(next() * 40);
  const lines: string[] = [];
  for (let i = 0; i < count; i++) lines.push(pick(next, vocabulary));
  return lines.join("\n") + (next() < 0.5 ? "\n" : "");
}

describe("parseScript", () => {
  it("gives the same elements as parse, with normalised text", () => {
    const script = parseScript("﻿INT. HOUSE - DAY\r\n\r\nSTEEL\r\nHello.\r\n");
    expect(script.source).toBe("INT. HOUSE - DAY\n\nSTEEL\nHello.\n");
    expect(script.lines).toEqual([
      "INT. HOUSE - DAY",
      "",
      "STEEL",
      "Hello.",
      "",
    ]);
    expect(script.elements).toEqual(
      parse("INT. HOUSE - DAY\n\nSTEEL\nHello.\n"),
    );
    expect(script.reparsed).toBeNull();
  });
});

describe("updateScript", () => {
  it("rejects an edit outside the text", () => {
    const script = parseScript("Hello.");
    expect(() => updateScript(script, { from: 3, to: 99, insert: "" })).toThrow(
      RangeError,
    );
    expect(() => updateScript(script, { from: 4, to: 2, insert: "" })).toThrow(
      RangeError,
    );
  });

  it("normalises line endings in inserted text", () => {
    const script = updateScript(parseScript("A.\n"), {
      from: 3,
      to: 3,
      insert: "\r\nTOM\r\nHi.\r",
    });
    expect(script.source).toBe("A.\n\nTOM\nHi.\n");
    expect(script.elements).toEqual(parse(script.source));
  });

  it("re-reads the line after an edit that turns a cue into action", () => {
    let script = parseScript("Rain.\n\nTOM\nHello.\n\nRain.\n");
    script = apply(script, { from: 7, to: 10, insert: "Tom" });
    expect(script.elements.map((e) => e.type)).toEqual([
      "action",
      "action",
      "action",
    ]);
  });

  it("pairs a dual cue with a speech before the edit", () => {
    const source = "Rain.\n\nTOM\nHi.\n\nDEV\nHey.\n\nRain.\n";
    const script = apply(parseScript(source), {
      from: source.indexOf("DEV") + 3,
      to: source.indexOf("DEV") + 3,
      insert: " ^",
    });
    const cues = script.elements.filter((e) => e.type === "character");
    expect(cues.map((c) => c.dual)).toEqual(["left", "right"]);
  });

  it("swallows the rest of the script when a boneyard is opened", () => {
    const source = "Rain.\n\nTOM\nHi.\n\nThe end.\n\nMore.\n */ After.\n";
    const script = apply(parseScript(source), { from: 7, to: 7, insert: "/*" });
    expect(script.reparsed).toBeNull();
  });

  it(
    "matches a full parse after every single edit to each fixture",
    () => {
      const edits = ["x", "\n", "\n\n", "^", "@", ".", "(", "  ", ""];
      for (const [path, raw] of Object.entries(fixtures)) {
        const base = parseScript(raw);
        const starts = [0];
        for (let i = 0; i < base.source.length; i++)
          if (base.source[i] === "\n") starts.push(i + 1, i);
        for (const at of starts) {
          for (const insert of edits) {
            const edit =
              insert === ""
                ? { from: at, to: Math.min(base.source.length, at + 1), insert }
                : { from: at, to: at, insert };
            const next = updateScript(base, edit);
            expect(next.elements, `${path} ${JSON.stringify(edit)}`).toEqual(
              parse(next.source),
            );
          }
        }
      }
    },
    SLOW_TEST_MS,
  );

  it.each([
    { name: "with boneyard", boneyard: true, minimumWindowed: 0.2 },
    { name: "without boneyard", boneyard: false, minimumWindowed: 0.95 },
  ])(
    "matches a full parse through long random editing sessions ($name)",
    ({ boneyard, minimumWindowed }) => {
      const next = random(boneyard ? 20261117 : 1711);
      const keep = (text: string): boolean =>
        boneyard || !(text.includes("/*") || text.includes("*/"));
      const vocabulary = VOCABULARY.filter(keep);
      const inserts = INSERTS.filter(keep);
      let windowed = 0;
      let steps = 0;
      for (let session = 0; session < 300; session++) {
        let script = parseScript(randomScript(next, vocabulary));
        for (let step = 0; step < 25; step++) {
          let edit = randomEdit(next, script.source, inserts);
          // A deletion can still join "/" and "*" from the vocabulary's "*bold*".
          if (!boneyard) {
            const after =
              script.source.slice(0, edit.from) +
              edit.insert +
              script.source.slice(edit.to);
            if (!keep(after)) edit = { from: 0, to: 0, insert: "x" };
          }
          const updated = updateScript(script, edit);
          expect(
            updated.elements,
            `session ${String(session)} step ${String(step)}: ${JSON.stringify(script.source)} ${JSON.stringify(edit)}`,
          ).toEqual(parse(updated.source));
          if (updated.reparsed !== null) windowed++;
          steps++;
          script = updated;
        }
      }
      // The incremental path must actually run, or this proves nothing.
      expect(windowed / steps).toBeGreaterThan(minimumWindowed);
    },
    SLOW_TEST_MS,
  );

  it("gives back the original elements when an edit is undone", () => {
    const next = random(7);
    const original = parseScript(generateScript(5, 3));
    for (let i = 0; i < 200; i++) {
      const edit = randomEdit(next, original.source);
      const changed = updateScript(original, edit);
      const undone = updateScript(changed, {
        from: edit.from,
        to: edit.from + edit.insert.replace(/\r\n?/g, "\n").length,
        insert: original.source.slice(edit.from, edit.to),
      });
      expect(undone.source).toBe(original.source);
      expect(undone.elements).toEqual(original.elements);
    }
  });

  it(
    "re-parses only the paragraphs around a keystroke in a long script",
    () => {
      const script = parseScript(generateScript(120));
      expect(script.lines.length).toBeGreaterThan(3000);
      const next = random(11);
      for (let i = 0; i < 100; i++) {
        const line = 10 + Math.floor(next() * (script.lines.length - 20));
        const at =
          script.lines.slice(0, line).reduce((n, l) => n + l.length + 1, 0) +
          Math.floor(next() * ((script.lines[line] ?? "").length + 1));
        const updated = updateScript(script, { from: at, to: at, insert: "a" });
        expect(updated.elements).toEqual(parse(updated.source));
        const window = updated.reparsed;
        expect(window).not.toBeNull();
        if (window !== null) expect(window[1] - window[0]).toBeLessThan(80);
      }
    },
    SLOW_TEST_MS,
  );

  it("keeps the element objects before the edit", () => {
    const script = parseScript(generateScript(10));
    const at = script.source.length - 5;
    const updated = updateScript(script, { from: at, to: at, insert: "a" });
    expect(updated.elements[1]).toBe(script.elements[1]);
  });
});
