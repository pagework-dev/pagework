import { StateField, type Transaction } from "@codemirror/state";
import {
  parseScript,
  updateScript,
  type ParsedScript,
  type TextEdit,
} from "@pagework/fountain";

/**
 * One edit covering every change in a transaction, in the old document's
 * offsets. Several changes (multiple cursors) become one larger edit, which
 * the incremental parser handles correctly with a larger window.
 */
export function coveringEdit(tr: Transaction): TextEdit | null {
  let fromA = Infinity;
  let toA = -Infinity;
  let fromB = Infinity;
  let toB = -Infinity;
  tr.changes.iterChangedRanges((fa, ta, fb, tb) => {
    fromA = Math.min(fromA, fa);
    toA = Math.max(toA, ta);
    fromB = Math.min(fromB, fb);
    toB = Math.max(toB, tb);
  });
  if (fromA === Infinity) return null;
  return { from: fromA, to: toA, insert: tr.newDoc.sliceString(fromB, toB) };
}

let last: { prev: ParsedScript; edit: TextEdit; next: ParsedScript } | null =
  null;

/**
 * updateScript, remembering the last call: the transaction filter that keeps
 * elements as chosen parses an edit, and when it adds nothing the state field
 * then parses the same edit again.
 */
export function updateParsed(prev: ParsedScript, edit: TextEdit): ParsedScript {
  if (
    last?.prev === prev &&
    last.edit.from === edit.from &&
    last.edit.to === edit.to &&
    last.edit.insert === edit.insert
  )
    return last.next;
  const next = updateScript(prev, edit);
  last = { prev, edit, next };
  return next;
}

/**
 * The parsed script, kept in step with the document on every transaction.
 * This is the keystroke path: only the paragraphs around an edit are parsed.
 */
export const scriptField = StateField.define<ParsedScript>({
  create: (state) => parseScript(state.doc.toString()),
  update(script, tr) {
    if (!tr.docChanged) return script;
    const edit = coveringEdit(tr);
    return edit === null ? script : updateParsed(script, edit);
  },
});
