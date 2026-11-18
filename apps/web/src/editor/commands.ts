import {
  EditorSelection,
  type ChangeSpec,
  type EditorState,
  type Line,
  type SelectionRange,
  type StateCommand,
  type Transaction,
  type TransactionSpec,
} from "@codemirror/state";
import {
  asParenthetical,
  enterNext,
  enterOnEmpty,
  isSpeechPart,
  startsParagraph,
  stripMarker,
  tabNext,
  tabPrevious,
  withoutParentheses,
  lineSyntax,
  type ScriptElement,
} from "./elements.ts";
import {
  chosenTypes,
  elementOfLine,
  lineKindAt,
  pendingField,
  setPending,
} from "./intents.ts";
import { elementAt, type LineKind } from "./lines.ts";
import { scriptField } from "./script.ts";

type Dispatch = (tr: Transaction) => void;

function kind(state: EditorState, line: number): LineKind {
  if (line < 1 || line > state.doc.lines) return "blank";
  return lineKindAt(state.field(scriptField), line);
}

function isEmpty(line: Line): boolean {
  return line.length === 0;
}

/** An empty line, or a parenthetical with nothing between its brackets. */
function isEmptyElement(state: EditorState, line: Line): boolean {
  if (isEmpty(line)) return true;
  return (
    /^\s*\(\s*\)\s*$/.test(line.text) &&
    kind(state, line.number) === "parenthetical"
  );
}

/** Where the writer's text starts on a line, after any hidden marker. */
export function contentStart(state: EditorState, line: Line): number {
  const element = elementAt(state.field(scriptField).elements, line.number);
  if (element === null) return line.from;
  const forced = "forced" in element && element.forced;
  return line.from + lineSyntax(line.text, element.type, forced).contentStart;
}

/** Where the writer's text ends: before a centred line's `<` or a dual cue's `^`. */
export function contentEnd(state: EditorState, line: Line): number {
  const element = elementAt(state.field(scriptField).elements, line.number);
  if (element === null) return line.to;
  const forced = "forced" in element && element.forced;
  const syntax = lineSyntax(line.text, element.type, forced);
  let end = line.length;
  // A parenthetical's closing bracket comes with it.
  if (element.type === "parenthetical") {
    const close = line.text.lastIndexOf(")");
    if (close !== -1) end = close;
  }
  for (const [from, to] of syntax.hidden)
    if (to === line.length && from >= syntax.contentStart)
      end = Math.min(end, from);
  return line.from + end;
}

function previousNonEmpty(state: EditorState, line: Line): Line | null {
  for (let n = line.number - 1; n >= 1; n--) {
    const l = state.doc.line(n);
    if (!isEmpty(l)) return l;
  }
  return null;
}

/** The transaction that makes `line` the chosen element, keeping its neighbours' elements. */
export function setElementSpec(
  state: EditorState,
  line: Line,
  element: ScriptElement,
): TransactionSpec | null {
  const changes: ChangeSpec[] = [];
  const doc = state.doc;
  const prev = line.number > 1 ? doc.line(line.number - 1) : null;
  const next = line.number < doc.lines ? doc.line(line.number + 1) : null;
  const speech = !startsParagraph(element);

  if (speech) {
    // Dialogue and parentheticals belong to the speech above them.
    if (prev !== null && isEmpty(prev)) {
      const before = previousNonEmpty(state, prev);
      const beforeKind = before === null ? "blank" : kind(state, before.number);
      if (beforeKind !== "character" && !isSpeechPart(beforeKind)) return null;
      changes.push({ from: before?.to ?? 0, to: prev.to });
    } else {
      const above = prev === null ? "blank" : kind(state, prev.number);
      if (above !== "character" && !isSpeechPart(above)) return null;
    }
  } else if (prev !== null && !isEmpty(prev)) {
    changes.push({ from: line.from, insert: "\n" });
  }

  const current = elementOfLine(state, line.number);
  let selection: SelectionRange;
  if (isEmpty(line)) {
    if (element === "parenthetical") {
      changes.push({ from: line.from, insert: "()" });
    }
  } else {
    let body = stripMarker(line.text, current);
    if (current === "parenthetical" && element !== "parenthetical")
      body = withoutParentheses(body);
    if (element === "parenthetical") body = asParenthetical(body);
    if (body !== line.text)
      changes.push({ from: line.from, to: line.to, insert: body });
  }

  // A cue or heading must not pull the next line into it.
  if (next !== null && !isEmpty(next) && element !== "character" && !speech) {
    changes.push({ from: line.to, insert: "\n" });
  }
  if (next !== null && !isEmpty(next) && element === "character") {
    const nextKind = kind(state, next.number);
    if (!isSpeechPart(nextKind)) changes.push({ from: line.to, insert: "\n" });
  }

  const changeSet = state.changes(changes);
  const newDoc = changeSet.apply(doc);
  const newLine = newDoc.lineAt(changeSet.mapPos(line.from, 1));
  if (isEmpty(line) && element === "parenthetical") {
    selection = EditorSelection.cursor(newLine.from + 1);
  } else {
    const head = state.selection.main.head;
    selection = EditorSelection.cursor(
      Math.min(changeSet.mapPos(head, 1), newLine.to),
    );
  }
  const types = new Map<number, ScriptElement>([[newLine.number, element]]);
  return {
    changes: changeSet,
    selection,
    annotations: chosenTypes.of(types),
    effects: setPending.of(
      newLine.length === 0 ? { pos: newLine.from, element } : null,
    ),
    scrollIntoView: true,
    userEvent: "input.element",
  };
}

function onCursorLine(
  run: (state: EditorState, line: Line) => TransactionSpec | null,
): StateCommand {
  return ({ state, dispatch }: { state: EditorState; dispatch: Dispatch }) => {
    const line = state.doc.lineAt(state.selection.main.head);
    const spec = run(state, line);
    if (spec === null) return false;
    dispatch(state.update(spec));
    return true;
  };
}

function writerElement(state: EditorState, line: Line): ScriptElement | null {
  const k = elementOfLine(state, line.number);
  if (k === "blank") return isEmpty(line) ? "action" : null;
  return k === "scene_heading" ||
    k === "action" ||
    k === "character" ||
    k === "parenthetical" ||
    k === "dialogue" ||
    k === "transition" ||
    k === "centered" ||
    k === "lyrics"
    ? k
    : null;
}

export function setElement(element: ScriptElement): StateCommand {
  return onCursorLine((state, line) => setElementSpec(state, line, element));
}

export const tab: StateCommand = onCursorLine((state, line) => {
  const current = writerElement(state, line);
  return current === null
    ? null
    : setElementSpec(state, line, tabNext(current));
});

export const shiftTab: StateCommand = onCursorLine((state, line) => {
  const current = writerElement(state, line);
  return current === null
    ? null
    : setElementSpec(state, line, tabPrevious(current));
});

/** Enter: the next element in the screenwriting sequence (DESIGN.md, Keyboard flow). */
export const enter: StateCommand = ({ state, dispatch }) => {
  const range = state.selection.main;
  let base = state;
  if (!range.empty) {
    base = state.update({
      changes: { from: range.from, to: range.to },
      userEvent: "delete.selection",
    }).state;
  }
  const line = base.doc.lineAt(base.selection.main.head);
  const current = writerElement(base, line);
  if (current === null) return false;
  if (isEmptyElement(base, line)) {
    const spec = setElementSpec(base, line, enterOnEmpty(current));
    if (spec === null) return false;
    dispatch(
      range.empty
        ? state.update(spec)
        : state.update(
            { changes: { from: range.from, to: range.to } },
            { ...spec, sequential: true },
          ),
    );
    return true;
  }
  const head = base.selection.main.head;
  const atEnd = head >= contentEnd(base, line);
  // At the end: the next element in the sequence. In the middle: the
  // element splits in two of the same kind.
  const element = atEnd ? enterNext(current) : current;
  const separator = startsParagraph(element) ? "\n\n" : "\n";
  const breakAt = atEnd ? line.to : head;
  const newLineNumber = line.number + separator.length;
  const types = new Map<number, ScriptElement>([[line.number, current]]);
  if (!atEnd) types.set(newLineNumber, element);
  const spec: TransactionSpec = {
    changes: { from: breakAt, insert: separator },
    selection: EditorSelection.cursor(breakAt + separator.length),
    annotations: chosenTypes.of(types),
    effects: setPending.of(
      atEnd ? { pos: breakAt + separator.length, element } : null,
    ),
    scrollIntoView: true,
    userEvent: "input",
  };
  dispatch(
    range.empty
      ? state.update(spec)
      : state.update(
          { changes: { from: range.from, to: range.to } },
          { ...spec, sequential: true },
        ),
  );
  return true;
};

/**
 * Backspace at the start of an element joins it to the element before, as
 * in Final Draft, taking the empty line and any hidden marker between them.
 */
export const joinBackward: StateCommand = ({ state, dispatch }) => {
  const range = state.selection.main;
  if (!range.empty) return false;
  const line = state.doc.lineAt(range.head);
  if (line.number === 1) return false;
  const prev = state.doc.line(line.number - 1);
  if (isEmpty(line)) {
    // An empty element after the hidden empty line goes with it.
    if (!isEmpty(prev)) return false;
    const before = previousNonEmpty(state, prev);
    if (before === null) return false;
    const pending = state.field(pendingField);
    if (pending === null && line.number < state.doc.lines) return false;
    dispatch(
      state.update({
        changes: { from: before.to, to: line.to },
        selection: EditorSelection.cursor(before.to),
        effects: setPending.of(null),
        userEvent: "delete.backward",
      }),
    );
    return true;
  }
  if (range.head !== contentStart(state, line)) return false;
  const before = isEmpty(prev) ? previousNonEmpty(state, prev) : prev;
  if (before === null) return false;
  const beforeElement = writerElement(state, before);
  const types = new Map<number, ScriptElement>();
  if (beforeElement !== null) types.set(before.number, beforeElement);
  dispatch(
    state.update({
      changes: { from: before.to, to: range.head },
      selection: EditorSelection.cursor(before.to),
      annotations: chosenTypes.of(types),
      userEvent: "delete.backward",
    }),
  );
  return true;
};

/** Delete at the end of an element joins the next element onto it. */
export const joinForward: StateCommand = ({ state, dispatch }) => {
  const range = state.selection.main;
  if (!range.empty) return false;
  const line = state.doc.lineAt(range.head);
  if (isEmpty(line) || range.head < contentEnd(state, line)) return false;
  if (line.number === state.doc.lines) return false;
  let next = state.doc.line(line.number + 1);
  while (isEmpty(next) && next.number < state.doc.lines)
    next = state.doc.line(next.number + 1);
  if (isEmpty(next)) return false;
  const current = writerElement(state, line);
  const types = new Map<number, ScriptElement>();
  if (current !== null) types.set(line.number, current);
  dispatch(
    state.update({
      changes: { from: line.to, to: contentStart(state, next) },
      annotations: chosenTypes.of(types),
      userEvent: "delete.forward",
    }),
  );
  return true;
};

/** Ctrl/Cmd+B, I, U: wrap the selection in Fountain's emphasis markers. */
export function toggleEmphasis(marker: "**" | "*" | "_"): StateCommand {
  return ({ state, dispatch }) => {
    const range = state.selection.main;
    if (range.empty) return false;
    const text = state.sliceDoc(range.from, range.to);
    if (text.includes("\n")) return false;
    const before = state.sliceDoc(range.from - marker.length, range.from);
    const after = state.sliceDoc(range.to, range.to + marker.length);
    if (before === marker && after === marker) {
      dispatch(
        state.update({
          changes: [
            { from: range.from - marker.length, to: range.from },
            { from: range.to, to: range.to + marker.length },
          ],
          selection: EditorSelection.range(
            range.from - marker.length,
            range.to - marker.length,
          ),
          userEvent: "input.format",
        }),
      );
      return true;
    }
    dispatch(
      state.update({
        changes: [
          { from: range.from, insert: marker },
          { from: range.to, insert: marker },
        ],
        selection: EditorSelection.range(
          range.from + marker.length,
          range.to + marker.length,
        ),
        userEvent: "input.format",
      }),
    );
    return true;
  };
}
