import { history } from "@codemirror/commands";
import { EditorState, type StateCommand } from "@codemirror/state";
import type { DecorationSet } from "@codemirror/view";
import { describe, expect, it } from "vitest";
import { enter, setElement, tab } from "../src/editor/commands.ts";
import { elementEditing, intents } from "../src/editor/intents.ts";
import { typeSpec } from "../src/editor/input.ts";
import { scriptField } from "../src/editor/script.ts";
import { separatorField, separators } from "../src/editor/view.ts";
import {
  generateScript,
  pick,
  random,
} from "../../../packages/fountain/test/generate.ts";

// Fuzzing and exhaustive edits: seconds on a slow CI machine, more than
// vitest's default 5 s limit. The time limit changes nothing they check.
const SLOW_TEST_MS = 60_000;

// The hidden empty lines between paragraphs are updated only around each
// edit, for speed. They must always equal a rebuild over the whole script.

function ranges(set: DecorationSet): [number, number][] {
  const out: [number, number][] = [];
  const cursor = set.iter();
  while (cursor.value !== null) {
    out.push([cursor.from, cursor.to]);
    cursor.next();
  }
  return out;
}

function run(state: EditorState, command: StateCommand): EditorState {
  let next = state;
  command({ state, dispatch: (tr) => (next = tr.state) });
  return next;
}

describe("separators", () => {
  it(
    "stay equal to a full rebuild through typing, Enter, Tab and deletions",
    () => {
      const next = random(606);
      let s = EditorState.create({
        doc: generateScript(4, 2),
        extensions: [
          history(),
          scriptField,
          intents(),
          elementEditing.of(true),
          separatorField,
        ],
      });
      for (let i = 0; i < 400; i++) {
        const at = Math.floor(next() * (s.doc.length + 1));
        s = s.update({ selection: { anchor: at } }).state;
        const roll = next();
        if (roll < 0.3)
          s = s.update(typeSpec(s, pick(next, ["a", " ", "TOM", "."]))).state;
        else if (roll < 0.5) s = run(s, enter);
        else if (roll < 0.6) s = run(s, tab);
        else if (roll < 0.7)
          s = run(
            s,
            setElement(pick(next, ["action", "character", "scene_heading"])),
          );
        else {
          const to = Math.min(s.doc.length, at + Math.floor(next() * 4));
          s = s.update({
            changes: { from: at, to, insert: pick(next, ["", "\n", "\n\n"]) },
          }).state;
        }
        expect(ranges(s.field(separatorField)), `step ${String(i)}`).toEqual(
          ranges(separators(s)),
        );
      }
    },
    SLOW_TEST_MS,
  );
});
