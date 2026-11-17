import { history, isolateHistory, redo, undo } from "@codemirror/commands";
import { EditorState, type StateCommand } from "@codemirror/state";
import { parse } from "@pagework/fountain";
import { describe, expect, it } from "vitest";
import {
  enter,
  joinBackward,
  setElement,
  shiftTab,
  tab,
} from "../src/editor/commands.ts";
import {
  enterNext,
  enterOnEmpty,
  isSpeechPart,
  SHORTCUT_ELEMENTS,
  tabNext,
  tabPrevious,
  type ScriptElement,
} from "../src/editor/elements.ts";
import {
  elementEditing,
  elementOfLine,
  intents,
} from "../src/editor/intents.ts";
import { typeSpec } from "../src/editor/input.ts";
import { pasteSpec } from "../src/editor/paste.ts";
import { lineKind } from "../src/editor/lines.ts";
import { scriptField } from "../src/editor/script.ts";
import { random, pick } from "../../../packages/fountain/test/generate.ts";

// ARCHITECTURE.md: "the element type the writer chose is the type the parser
// reads back, for every element, after any edit, paste, undo or import."
// These tests drive the editor's real commands on an EditorState and compare
// what the writer chose with what @pagework/fountain reads from the text.

function create(doc = ""): EditorState {
  return EditorState.create({
    doc,
    extensions: [history(), scriptField, intents(), elementEditing.of(true)],
  });
}

function run(state: EditorState, command: StateCommand): EditorState {
  let next = state;
  command({
    state,
    dispatch: (tr) => {
      next = tr.state;
    },
  });
  return next;
}

function type(state: EditorState, text: string): EditorState {
  let s = state;
  for (const ch of text) s = s.update(typeSpec(s, ch)).state;
  return s;
}

/** What the parser reads, line by line, for lines with text. */
function readBack(state: EditorState): string[] {
  const text = state.doc.toString();
  const elements = parse(text);
  return text
    .split("\n")
    .map((line, i) => (line.trim() === "" ? null : lineKind(elements, i + 1)))
    .filter((k): k is NonNullable<typeof k> => k !== null);
}

function cursorElement(state: EditorState): string {
  return elementOfLine(
    state,
    state.doc.lineAt(state.selection.main.head).number,
  );
}

describe("writing a scene with the keyboard", () => {
  it("writes clean Fountain for a heading, action and a speech", () => {
    let s = create();
    s = type(s, "int. harbour office - night");
    s = run(s, enter);
    s = type(s, "Rain needles the window.");
    s = run(s, enter);
    s = run(s, tab);
    s = type(s, "marguerite");
    s = run(s, enter);
    s = type(s, "You said six.");
    expect(s.doc.toString()).toBe(
      "int. harbour office - night\n\nRain needles the window.\n\nMARGUERITE\nYou said six.",
    );
    expect(readBack(s)).toEqual([
      "scene_heading",
      "action",
      "character",
      "dialogue",
    ]);
  });

  it("follows the Enter table, including Enter on an empty line", () => {
    let s = create("Rain.");
    s = s.update({ selection: { anchor: 5 } }).state;
    s = run(s, enter);
    expect(cursorElement(s)).toBe("action");
    s = run(s, enter);
    expect(cursorElement(s)).toBe("scene_heading");
    s = run(s, enter);
    expect(cursorElement(s)).toBe("action");
  });

  it("keeps a heading the writer typed in lower case without INT.", () => {
    let s = create();
    s = type(s, "the lighthouse");
    expect(s.doc.toString()).toBe(".the lighthouse");
    expect(readBack(s)).toEqual(["scene_heading"]);
  });

  it("keeps action that starts like a heading as action", () => {
    let s = create("Rain.");
    s = s.update({ selection: { anchor: 5 } }).state;
    s = run(s, enter);
    s = type(s, "INT. is painted on the door.");
    expect(readBack(s)).toEqual(["action", "action"]);
  });

  it("capitalises a cue as it is typed and drops markers once not needed", () => {
    let s = create("Rain.");
    s = s.update({ selection: { anchor: 5 } }).state;
    s = run(s, enter);
    s = run(s, tab);
    s = type(s, "tom");
    expect(s.doc.toString()).toBe("Rain.\n\n@TOM");
    s = run(s, enter);
    s = type(s, "Hi.");
    expect(s.doc.toString()).toBe("Rain.\n\nTOM\nHi.");
  });

  it("never lets an edit change the element on the next line", () => {
    let s = create("Rain.\n\nTOM\nHi.");
    // Join the cue onto the action, then undo: and type a capital line above.
    s = s.update({ selection: { anchor: 5 } }).state;
    s = run(s, enter);
    s = type(s, "WIND");
    expect(readBack(s)).toEqual(["action", "action", "character", "dialogue"]);
  });

  it("joins an element to the one before with Backspace at its start", () => {
    let s = create("Rain.\n\nWind.");
    s = s.update({ selection: { anchor: 7 } }).state;
    s = run(s, joinBackward);
    expect(s.doc.toString()).toBe("Rain.Wind.");
  });

  it("takes back an element change and its markers in one undo", () => {
    let s = create("Rain.");
    s = s.update({ selection: { anchor: 2 } }).state;
    s = run(s, setElement("character"));
    expect(readBack(s)).toEqual(["character"]);
    s = run(s, undo);
    expect(s.doc.toString()).toBe("Rain.");
    s = run(s, redo);
    expect(readBack(s)).toEqual(["character"]);
  });

  it("refuses dialogue where there is no speech to belong to", () => {
    const s = create("Rain.\n\nWind.");
    const moved = s.update({ selection: { anchor: 9 } }).state;
    expect(run(moved, setElement("dialogue"))).toBe(moved);
  });
});

/** The writer's script as the test sees it: one entry per element they made. */
interface Entry {
  element: ScriptElement;
  empty: boolean;
  /** A parenthetical with only its brackets: it counts as empty for Enter. */
  bare?: boolean;
}

const FIRST = Array.from(
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ",
);
const REST = [...FIRST, ...Array.from("0123456789 .,'-!?:;*_>@=#&")];

describe("the core rule under random writing", () => {
  it("reads back every element as chosen after every keystroke, command and undo", () => {
    const next = random(1117);
    let steps = 0;
    for (let session = 0; session < 80; session++) {
      let s = create();
      const model: Entry[] = [{ element: "scene_heading", empty: true }];
      let cursor = 0;
      let previous: { doc: string; chosen: ScriptElement[] } | null = null;
      const chosen = (): ScriptElement[] =>
        model.filter((e) => !e.empty).map((e) => e.element);

      for (let step = 0; step < 40; step++) {
        const current = model[cursor];
        if (current === undefined) throw new Error("cursor outside the model");
        const before = { doc: s.doc.toString(), chosen: chosen() };
        const roll = next();
        let label: string;
        if (roll < 0.45) {
          const text =
            // A heading can't start with a symbol in Fountain, so a new
            // element's first character is a letter, as it nearly always is.
            (current.empty || current.bare === true ? pick(next, FIRST) : "") +
            Array.from({ length: Math.floor(next() * 6) }, () =>
              pick(next, REST),
            ).join("");
          if (text === "") continue;
          label = `type ${JSON.stringify(text)}`;
          s = type(s, text);
          current.empty = false;
          current.bare = false;
        } else if (roll < 0.7) {
          label = "enter";
          s = run(s, enter);
          if (current.empty || current.bare === true) {
            current.element = enterOnEmpty(current.element);
            current.empty = true;
            current.bare = false;
          } else {
            model.splice(cursor + 1, 0, {
              element: enterNext(current.element),
              empty: true,
            });
            cursor++;
          }
        } else if (roll < 0.95) {
          const forward = next() < 0.5;
          const byTab = next() < 0.5;
          const target = byTab
            ? forward
              ? tabNext(current.element)
              : tabPrevious(current.element)
            : pick(next, SHORTCUT_ELEMENTS);
          label = byTab ? (forward ? "tab" : "shift+tab") : `set ${target}`;
          const above = model
            .slice(0, cursor)
            .filter((e) => !e.empty)
            .at(-1)?.element;
          const below = model.slice(cursor + 1).find((e) => !e.empty)?.element;
          const speech = target === "dialogue" || target === "parenthetical";
          const inSpeech =
            above === "character" ||
            (above !== undefined && isSpeechPart(above));
          // Choices Fountain can't express (dialogue with no cue above, or a
          // cue removed from above its speech) are covered by the scenario
          // tests; here the writer only makes the others.
          if (speech && !inSpeech) continue;
          if (
            below !== undefined &&
            isSpeechPart(below) &&
            target !== "character" &&
            !speech
          )
            continue;
          if (target === current.element) continue;
          const command = !byTab
            ? setElement(target)
            : forward
              ? tab
              : shiftTab;
          s = run(s, command);
          if (current.bare === true) current.empty = true;
          current.bare = false;
          if (target === "parenthetical" && current.empty) {
            current.empty = false;
            current.bare = true;
          }
          current.element = target;
        } else if (previous !== null) {
          // Undo takes back exactly the last step; redo puts it back.
          s = run(s, undo);
          expect(s.doc.toString(), "undo").toBe(previous.doc);
          expect(readBack(s), "undo").toEqual(previous.chosen);
          s = run(s, redo);
          expect(s.doc.toString(), "redo").toBe(before.doc);
          expect(readBack(s), "redo").toEqual(before.chosen);
          break;
        } else {
          continue;
        }
        // Choosing an element for an empty line changes no text, so it
        // isn't an undo step.
        if (s.doc.toString() !== before.doc) previous = before;
        s = s.update({ annotations: isolateHistory.of("full") }).state;
        steps++;
        const where = `session ${String(session)} step ${String(step)}: ${label}\n${JSON.stringify(s.doc.toString())}`;
        expect(readBack(s), where).toEqual(chosen());
        expect(cursorElement(s), where).toBe(model[cursor]?.element);
      }
    }
    expect(steps).toBeGreaterThan(1000);
  });
});

describe("paste", () => {
  it("keeps the pasted elements and the elements around them", () => {
    let s = create("Rain.\n\nTOM\nHi.");
    s = s.update({ selection: { anchor: 5 } }).state;
    s = s.update(
      pasteSpec(s, "\n\nEXT. SEA WALL - DAY\n\nDEV\n(quietly)\nThe tide.\n\n"),
    ).state;
    expect(readBack(s)).toEqual([
      "action",
      "scene_heading",
      "character",
      "parenthetical",
      "dialogue",
      "character",
      "dialogue",
    ]);
  });

  it("removes continuation markers from a script copied out of a PDF", () => {
    let s = create("Rain.");
    s = s.update({ selection: { anchor: 5 } }).state;
    s = s.update(
      pasteSpec(
        s,
        "\n\nTOM\nI never said when.\n(MORE)\n\nTOM (CONT'D)\nOnly that it turns.\n",
      ),
    ).state;
    expect(s.doc.toString()).not.toMatch(/MORE|CONT'D/);
    expect(readBack(s)).toEqual([
      "action",
      "character",
      "dialogue",
      "character",
      "dialogue",
    ]);
  });

  it("keeps a pasted title page in an empty script", () => {
    let s = create();
    s = s.update(
      pasteSpec(
        s,
        "Title: Low Tide\nAuthor: Someone\n\nINT. LIGHTHOUSE - NIGHT\n\nRain.\n",
      ),
    ).state;
    expect(readBack(s)).toEqual([
      "title_page",
      "title_page",
      "scene_heading",
      "action",
    ]);
  });

  it("reads plain text with no script structure as action", () => {
    let s = create("Rain.");
    s = s.update({ selection: { anchor: 5 } }).state;
    s = s.update(
      pasteSpec(s, "\n\nDear Tom,\nthe ferry leaves at six.\nSee you there.\n"),
    ).state;
    expect(readBack(s)).toEqual(["action", "action", "action", "action"]);
  });

  it("keeps a pasted line that looks like a heading as action when pasted into action", () => {
    let s = create("She reads: ");
    s = s.update({ selection: { anchor: 11 } }).state;
    s = s.update(pasteSpec(s, "INT. KITCHEN")).state;
    expect(readBack(s)).toEqual(["action"]);
  });
});
