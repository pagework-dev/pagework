import {
  StateEffect,
  StateField,
  type EditorState,
  type Extension,
  type StateCommand,
} from "@codemirror/state";
import { Decoration, EditorView, WidgetType } from "@codemirror/view";
import { plainText, type Element } from "@pagework/fountain";
import { contentEnd, contentStart } from "./commands.ts";
import { elementOfLine } from "./intents.ts";
import { scriptField } from "./script.ts";

/**
 * Inline autocomplete (DESIGN.md, Autocomplete): the rest of the best match
 * appears after the cursor, dimmed, and goes into the script only when the
 * writer accepts it with Enter or Tab.
 */

export interface Suggestion {
  pos: number;
  /** What accepting adds after the cursor. */
  rest: string;
}

const HEADING_PREFIXES = ["INT. ", "EXT. ", "INT./EXT. "];
const KNOWN_PREFIX = /^(INT\.\/EXT\.|INT\/EXT|I\/E|INT\.|EXT\.|EST\.)\s*/i;
const TIMES = ["DAY", "NIGHT"];
const TRANSITIONS = ["CUT TO:", "DISSOLVE TO:", "FADE OUT."];

/** Unique values, keeping the first occurrence's order. */
function unique(values: string[]): string[] {
  return [...new Set(values)];
}

/** Cue names, most recently used before `line` first. */
export function characterNames(
  elements: readonly Element[],
  line: number,
): string[] {
  const before: string[] = [];
  const after: string[] = [];
  for (const el of elements) {
    if (el.type !== "character") continue;
    (el.lines[0] < line ? before : after).push(el.name.toUpperCase());
  }
  return unique([...before.reverse(), ...after]);
}

function headingParts(elements: readonly Element[]): {
  locations: string[];
  times: string[];
} {
  const locations: string[] = [];
  const times: string[] = [];
  for (const el of elements) {
    if (el.type !== "scene_heading") continue;
    const text = plainText(el.content).toUpperCase().replace(KNOWN_PREFIX, "");
    const parts = text.split(" - ");
    const location = parts[0]?.trim();
    if (location !== undefined && location !== "") locations.push(location);
    if (parts.length > 1) {
      const time = parts.at(-1)?.trim();
      if (time !== undefined && time !== "") times.push(time);
    }
  }
  return { locations: unique(locations), times: unique([...times, ...TIMES]) };
}

function completion(typed: string, choices: string[]): string | null {
  const upper = typed.toUpperCase();
  const match = choices.find(
    (c) => c.length > upper.length && c.toUpperCase().startsWith(upper),
  );
  return match === undefined ? null : match.slice(typed.length);
}

export function suggestionFor(state: EditorState): Suggestion | null {
  const range = state.selection.main;
  if (!range.empty) return null;
  const line = state.doc.lineAt(range.head);
  if (line.length === 0 || range.head !== contentEnd(state, line)) return null;
  const typed = state
    .sliceDoc(contentStart(state, line), range.head)
    .trimStart();
  if (typed === "") return null;
  const { elements } = state.field(scriptField);
  const kind = elementOfLine(state, line.number);
  let rest: string | null = null;
  if (kind === "character") {
    rest = completion(typed, characterNames(elements, line.number));
  } else if (kind === "scene_heading") {
    const prefix = KNOWN_PREFIX.exec(typed);
    if (prefix === null) {
      rest = completion(typed, HEADING_PREFIXES);
    } else {
      const { locations, times } = headingParts(elements);
      const after = typed.slice(prefix[0].length);
      const dash = after.lastIndexOf(" - ");
      rest =
        dash === -1
          ? completion(after, locations)
          : completion(after.slice(dash + 3), times);
    }
  } else if (kind === "transition") {
    const used = elements
      .filter((e) => e.type === "transition")
      .map((e) => plainText(e.content).toUpperCase());
    rest = completion(typed, unique([...used, ...TRANSITIONS]));
  }
  return rest === null || rest === "" ? null : { pos: range.head, rest };
}

const dismiss = StateEffect.define();

export const suggestionField = StateField.define<Suggestion | null>({
  create: () => null,
  update(value, tr) {
    if (tr.effects.some((e) => e.is(dismiss))) return null;
    // Suggestions follow typing; moving the cursor or any other edit clears them.
    if (tr.isUserEvent("input.type")) return suggestionFor(tr.state);
    if (tr.docChanged || tr.selection !== undefined) return null;
    return value;
  },
  provide: (field) =>
    EditorView.decorations.from(field, (s) =>
      s === null
        ? Decoration.none
        : Decoration.set([
            Decoration.widget({
              widget: new GhostWidget(s.rest),
              side: 1,
            }).range(s.pos),
          ]),
    ),
});

class GhostWidget extends WidgetType {
  readonly text: string;
  constructor(text: string) {
    super();
    this.text = text;
  }
  override eq(other: GhostWidget): boolean {
    return other.text === this.text;
  }
  toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = "pw-suggestion";
    span.textContent = this.text;
    return span;
  }
}

export const acceptSuggestion: StateCommand = ({ state, dispatch }) => {
  const suggestion = state.field(suggestionField, false);
  if (suggestion == null) return false;
  dispatch(
    state.update({
      changes: { from: suggestion.pos, insert: suggestion.rest },
      selection: { anchor: suggestion.pos + suggestion.rest.length },
      effects: dismiss.of(null),
      userEvent: "input.complete",
    }),
  );
  return true;
};

export const dismissSuggestion: StateCommand = ({ state, dispatch }) => {
  if (state.field(suggestionField, false) == null) return false;
  dispatch(state.update({ effects: dismiss.of(null) }));
  return true;
};

export function suggestions(): Extension {
  return suggestionField;
}
