import {
  EditorSelection,
  type EditorState,
  type Extension,
  type TransactionSpec,
} from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { parse, removeContinuationMarkers } from "@pagework/fountain";
import { isScriptElement, type ScriptElement } from "./elements.ts";
import { chosenTypes, elementOfLine } from "./intents.ts";
import { lineKind } from "./lines.ts";

/**
 * Pasted text keeps the elements it can be read as: Fountain from another
 * app, or a script copied from a PDF or email, is read the way the parser
 * reads a file. Continuation markers are removed (ADR 0011). The lines
 * around the paste keep their elements, because the editor re-checks them
 * like any other edit; that is what stops a paste from changing later lines.
 */
export function pasteSpec(state: EditorState, raw: string): TransactionSpec {
  const text = removeContinuationMarkers(raw.replace(/\r\n?/g, "\n")).text;
  const { from, to } = state.selection.main;
  const types = new Map<number, ScriptElement | null>();
  const startLine = state.doc.lineAt(from);
  const pastedLines = text.split("\n");
  if (pastedLines.length > 1) {
    const elements = parse(text);
    pastedLines.forEach((line, i) => {
      if (line.trim() === "") return;
      const kind = lineKind(elements, i + 1);
      // The first line joins the text before the cursor, which keeps its element.
      const joinsLine = i === 0 && from > startLine.from;
      const element = joinsLine ? elementOfLine(state, startLine.number) : kind;
      // Title pages, sections and notes are left to the parser.
      types.set(
        startLine.number + i,
        isScriptElement(element) ? element : null,
      );
    });
  }
  return {
    changes: { from, to, insert: text },
    selection: EditorSelection.cursor(from + text.length),
    annotations: chosenTypes.of(types),
    userEvent: "input.paste",
    scrollIntoView: true,
  };
}

export function pasteHandling(): Extension {
  return EditorView.domEventHandlers({
    paste(event, view) {
      const text = event.clipboardData?.getData("text/plain");
      if (text === undefined || text === "") return false;
      event.preventDefault();
      view.dispatch(pasteSpec(view.state, text));
      return true;
    },
  });
}
