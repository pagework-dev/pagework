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

/**
 * The parsed script, kept in step with the document on every transaction.
 * This is the keystroke path: only the paragraphs around an edit are parsed.
 */
export const scriptField = StateField.define<ParsedScript>({
  create: (state) => parseScript(state.doc.toString()),
  update(script, tr) {
    if (!tr.docChanged) return script;
    const edit = coveringEdit(tr);
    return edit === null ? script : updateScript(script, edit);
  },
});
