import {
  EditorSelection,
  type EditorState,
  type Extension,
  type TransactionSpec,
} from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { capitalisesInput, isScriptElement } from "./elements.ts";
import { elementOfLine } from "./intents.ts";

/**
 * Typed text as it goes into the script. Character cues are written in
 * capitals, as Final Draft does: the template prints cues in capitals, and a
 * cue typed in lower case would otherwise print in lower case (a cue forced
 * with @ keeps the writer's case).
 */
export function typedText(
  state: EditorState,
  pos: number,
  text: string,
): string {
  const element = elementOfLine(state, state.doc.lineAt(pos).number);
  return isScriptElement(element) && capitalisesInput(element)
    ? text.toUpperCase()
    : text;
}

/** The transaction for typing `text` over the main selection. */
export function typeSpec(state: EditorState, text: string): TransactionSpec {
  const { from, to } = state.selection.main;
  const insert = typedText(state, from, text);
  return {
    changes: { from, to, insert },
    selection: EditorSelection.cursor(from + insert.length),
    userEvent: "input.type",
    scrollIntoView: true,
  };
}

export function typingInput(): Extension {
  return EditorView.inputHandler.of((view, from, to, text) => {
    if (view.composing) return false;
    const insert = typedText(view.state, from, text);
    if (insert === text) return false;
    view.dispatch({
      changes: { from, to, insert },
      selection: EditorSelection.cursor(from + insert.length),
      userEvent: "input.type",
      scrollIntoView: true,
    });
    return true;
  });
}
