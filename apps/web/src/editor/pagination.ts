import type { EditorView } from "@codemirror/view";
import { paginate, type PageModel } from "@pagework/layout";
import type { Template } from "@pagework/templates";
import { scriptField } from "./script.ts";

/** Typing pauses this long before pages are counted again. */
export const PAGINATION_DELAY_MS = 300;

/**
 * Runs the paginator after typing pauses, never on the keystroke path
 * (ARCHITECTURE.md, Performance budgets). A newer request replaces an older
 * one that hasn't run yet.
 */
export function paginationScheduler(
  getTemplate: () => Template,
  onPages: (model: PageModel) => void,
): { schedule: (view: EditorView) => void; cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const cancel = (): void => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
  return {
    cancel,
    schedule(view) {
      cancel();
      timer = setTimeout(() => {
        timer = null;
        const script = view.state.field(scriptField);
        onPages(paginate(script.elements, getTemplate()));
      }, PAGINATION_DELAY_MS);
    },
  };
}
