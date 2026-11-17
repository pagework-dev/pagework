import { EditorView } from "@codemirror/view";

/**
 * The one editor on the screen, for chrome that acts on it (the navigator
 * moves the cursor; the toolbar changes elements). Not reactive: components
 * read it when the writer acts.
 */
let current: EditorView | null = null;

export function setEditorView(view: EditorView | null): void {
  current = view;
}

export function editorView(): EditorView | null {
  return current;
}

/** Moves the cursor to the start of a 1-based line and scrolls it near the top. */
export function goToLine(line: number): void {
  const view = current;
  if (view === null) return;
  const pos = view.state.doc.line(
    Math.max(1, Math.min(line, view.state.doc.lines)),
  ).from;
  view.dispatch({
    selection: { anchor: pos },
    effects: EditorView.scrollIntoView(pos, { y: "start", yMargin: 48 }),
  });
  view.focus();
}
