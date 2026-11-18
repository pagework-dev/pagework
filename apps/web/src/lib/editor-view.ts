import { EditorView } from "@codemirror/view";

/**
 * The one editor on the screen, for chrome that acts on it (the navigator
 * moves the cursor; the toolbar changes elements; the file menu loads text).
 * Not reactive: components read it when the writer acts.
 */
let current: EditorView | null = null;
let loader: ((text: string) => void) | null = null;

export function setEditorView(
  view: EditorView | null,
  load: ((text: string) => void) | null = null,
): void {
  current = view;
  loader = load;
}

export function editorView(): EditorView | null {
  return current;
}

/** Replaces the script, starting a fresh undo history. */
export function loadText(text: string): void {
  loader?.(text);
}

export function currentText(): string {
  return current?.state.doc.toString() ?? "";
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
