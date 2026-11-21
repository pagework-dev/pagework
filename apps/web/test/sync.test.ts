import { ChangeSet, Text } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import {
  deltaToChanges,
  syncBody,
  TEXT_NAME,
} from "../src/server/sync.svelte.ts";

// Changes made elsewhere arrive as Yjs deltas and are applied to the
// editor's text. If the mapping were wrong, the editor would show
// different text from what is saved.

function random(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

describe("changes from elsewhere", () => {
  it("land in the editor exactly as in the shared text", () => {
    const next = random(42);
    for (let round = 0; round < 200; round++) {
      const here = new Y.Doc();
      const there = new Y.Doc();
      const start = "INT. HOUSE - DAY\n\nRain on the roof.\n\nTOM\nHello.";
      there.getText(TEXT_NAME).insert(0, start);
      Y.applyUpdate(here, Y.encodeStateAsUpdate(there));
      let editor = Text.of(start.split("\n"));

      here.getText(TEXT_NAME).observe((event) => {
        const changes = ChangeSet.of(
          deltaToChanges(event.delta),
          editor.length,
        );
        editor = changes.apply(editor);
      });

      // Several edits elsewhere, then one update arrives.
      const text = there.getText(TEXT_NAME);
      there.transact(() => {
        for (let i = 0; i < 4; i++) {
          const length = text.length;
          const at = Math.floor(next() * (length + 1));
          if (next() < 0.5 && length > at) {
            text.delete(at, Math.min(length - at, 1 + Math.floor(next() * 5)));
          } else {
            text.insert(
              at,
              ["x", "\n", "(beat)", "ÉCLAIR"][Math.floor(next() * 4)] ?? "",
            );
          }
        }
      });
      Y.applyUpdate(
        here,
        Y.encodeStateAsUpdate(there, Y.encodeStateVector(here)),
      );
      expect(editor.toString()).toBe(here.getText(TEXT_NAME).toJSON());
      expect(editor.toString()).toBe(text.toJSON());
    }
  });
});

describe("the sync request body", () => {
  it("is the update's length, the update, then the state vector", () => {
    const body = syncBody(new Uint8Array([1, 2, 3]), new Uint8Array([9]));
    expect([...body]).toEqual([0, 0, 0, 3, 1, 2, 3, 9]);
  });
});
