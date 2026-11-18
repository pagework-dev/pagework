import { ChangeSet, EditorState } from "@codemirror/state";
import { parse } from "@pagework/fountain";
import { describe, expect, it } from "vitest";
import { scriptField } from "../src/editor/script.ts";
import { lineKind } from "../src/editor/lines.ts";
import {
  generateScript,
  random,
} from "../../../packages/fountain/test/generate.ts";

// Fuzzing and exhaustive edits: seconds on a slow CI machine, more than
// vitest's default 5 s limit. The time limit changes nothing they check.
const SLOW_TEST_MS = 60_000;

describe("scriptField", () => {
  it(
    "stays equal to a full parse through transactions with several changes",
    () => {
      const next = random(42);
      let state = EditorState.create({
        doc: generateScript(3, 9),
        extensions: [scriptField],
      });
      const pieces = ["a", "\n", "\n\nTOM\nHi.\n", "", "^", "INT. "];
      for (let i = 0; i < 300; i++) {
        const length = state.doc.length;
        const a = Math.floor(next() * length);
        const b = Math.min(length, a + Math.floor(next() * 5));
        const c = Math.floor(next() * length);
        const specs = [
          { from: a, to: b, insert: pieces[i % pieces.length] ?? "" },
        ];
        if (c < a || c > b) specs.push({ from: c, to: c, insert: "x" });
        const changes = ChangeSet.of(specs, length);
        state = state.update({ changes }).state;
        expect(state.field(scriptField).elements).toEqual(
          parse(state.doc.toString()),
        );
        expect(state.field(scriptField).source).toBe(state.doc.toString());
      }
    },
    SLOW_TEST_MS,
  );
});

describe("lineKind", () => {
  it("names the element on each line, and empty lines", () => {
    const elements = parse("INT. HOUSE - DAY\n\nTOM\nHello.\n");
    expect([1, 2, 3, 4].map((n) => lineKind(elements, n))).toEqual([
      "scene_heading",
      "blank",
      "character",
      "dialogue",
    ]);
  });
});
