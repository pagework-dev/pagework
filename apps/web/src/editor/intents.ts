import {
  Annotation,
  EditorState,
  Facet,
  StateEffect,
  StateField,
  type Extension,
  type Text,
  type Transaction,
  type TransactionSpec,
} from "@codemirror/state";
import type { ParsedScript } from "@pagework/fountain";
import { isScriptElement, type ScriptElement } from "./elements.ts";
import { elementAt, type LineKind } from "./lines.ts";
import { normalise } from "./normalise.ts";
import { coveringEdit, scriptField, updateParsed } from "./script.ts";

/**
 * Element choices the text can't hold yet. An empty line is just an empty
 * line to Fountain, so the element the writer chose for it (after Enter, or
 * from the picker) lives here until they type.
 */
export interface Pending {
  /** Start of the empty line. */
  pos: number;
  element: ScriptElement;
}

export const setPending = StateEffect.define<Pending | null>({
  map: (value, changes) =>
    value === null ? null : { ...value, pos: changes.mapPos(value.pos, -1) },
});

/**
 * Element types the writer chose in this transaction, by 1-based line in the
 * new document. Null leaves a line to the parser (a pasted title page).
 */
export const chosenTypes =
  Annotation.define<ReadonlyMap<number, ScriptElement | null>>();

/**
 * Marks a transaction that replaces the text wholesale (opening a file) or
 * comes from the Fountain source view: the text is taken exactly as it is.
 */
export const verbatim = Annotation.define<boolean>();

/** False while "Show Fountain" is on: the writer edits the raw text. */
export const elementEditing = Facet.define<boolean, boolean>({
  combine: (values) => values.every(Boolean),
});

function pendingAfter(doc: Text, value: Pending | null): Pending | null {
  if (value === null) return null;
  const line = doc.lineAt(Math.min(value.pos, doc.length));
  return line.length === 0 ? { ...value, pos: line.from } : null;
}

export const pendingField = StateField.define<Pending | null>({
  create: (state) =>
    state.doc.length === 0 ? { pos: 0, element: "scene_heading" } : null,
  update(value, tr) {
    let next = value;
    let explicit = false;
    for (const effect of tr.effects) {
      if (effect.is(setPending)) {
        next = effect.value;
        explicit = true;
      }
    }
    if (!explicit && next !== null && tr.docChanged)
      next = { ...next, pos: tr.changes.mapPos(next.pos, -1) };
    next = pendingAfter(tr.state.doc, next);
    // Leaving the line drops the choice; the line stays an empty line.
    if (next !== null && !explicit && tr.selection !== undefined) {
      const head = tr.state.selection.main.head;
      if (tr.state.doc.lineAt(head).from !== next.pos) next = null;
    }
    return next;
  },
});

export function lineKindAt(script: ParsedScript, line: number): LineKind {
  return elementAt(script.elements, line)?.type ?? "blank";
}

/**
 * The element the writer sees on a line: the pending choice on an empty
 * line, otherwise what the parser reads. An empty line with no choice
 * becomes action when typed in; an empty script starts with a scene heading.
 */
export function elementOfLine(state: EditorState, line: number): LineKind {
  const pending = state.field(pendingField);
  const docLine = state.doc.line(line);
  if (pending !== null && pending.pos === docLine.from) return pending.element;
  return lineKindAt(state.field(scriptField), line);
}

function intentResolver(
  tr: Transaction,
): (line: number) => ScriptElement | undefined {
  const explicit = tr.annotation(chosenTypes);
  const old = tr.startState.field(scriptField);
  const oldDoc = tr.startState.doc;
  const newDoc = tr.newDoc;
  const pending = tr.startState.field(pendingField);
  const inverse = tr.changes.invert(oldDoc);
  return (line) => {
    if (explicit?.has(line) === true) return explicit.get(line) ?? undefined;
    if (line < 1 || line > newDoc.lines) return undefined;
    // Where this line began before the edit: typing in a line keeps its element.
    const oldLine = oldDoc.lineAt(inverse.mapPos(newDoc.line(line).from, -1));
    const kind = lineKindAt(old, oldLine.number);
    if (kind === "blank") {
      if (pending !== null && pending.pos === oldLine.from)
        return pending.element;
      return "action";
    }
    return isScriptElement(kind) ? kind : undefined;
  };
}

/**
 * Re-checks the lines an edit could affect and adds the marker changes to
 * the same transaction, so one undo takes back both.
 */
function keepChosenTypes(
  tr: Transaction,
): Transaction | readonly TransactionSpec[] {
  if (tr.annotation(verbatim) === true) return tr;
  if (tr.isUserEvent("undo") || tr.isUserEvent("redo")) return tr;
  if (!tr.startState.facet(elementEditing)) return tr;
  const explicit = tr.annotation(chosenTypes);
  if (!tr.docChanged && explicit === undefined) return tr;
  const edit = coveringEdit(tr);
  const old = tr.startState.field(scriptField);
  const next = edit === null ? old : updateParsed(old, edit);
  let [first, last] =
    edit === null
      ? [Infinity, -Infinity]
      : (next.reparsed ?? [1, tr.newDoc.lines]);
  for (const line of explicit?.keys() ?? []) {
    first = Math.min(first, line);
    last = Math.max(last, line);
  }
  if (first > last) return tr;
  const { changes } = normalise(next, first, last, intentResolver(tr));
  if (changes.length === 0) return tr;
  return [
    tr,
    {
      changes: changes.map(({ line, text }) => {
        const docLine = tr.newDoc.line(line);
        return { from: docLine.from, to: docLine.to, insert: text };
      }),
      sequential: true,
    },
  ];
}

export function intents(): Extension {
  return [pendingField, EditorState.transactionFilter.of(keepChosenTypes)];
}
