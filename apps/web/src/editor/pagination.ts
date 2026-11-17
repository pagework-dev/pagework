import { ViewPlugin, type EditorView, type ViewUpdate } from "@codemirror/view";
import { paginate } from "@pagework/layout";
import { pageMap, setPageMap, type PageMap } from "./pages.ts";
import { scriptField } from "./script.ts";
import { templateFacet } from "./view.ts";

/** Typing pauses this long before pages are counted again. */
export const PAGINATION_DELAY_MS = 300;

/**
 * Runs the paginator after typing pauses, never on the keystroke path
 * (ARCHITECTURE.md, Performance budgets). The page view and the status bar
 * get the result; until then, page edges move with the text.
 */
export function pagination(onPages: (map: PageMap, view: EditorView) => void) {
  return ViewPlugin.fromClass(
    class {
      timer: ReturnType<typeof setTimeout> | null = null;
      readonly view: EditorView;
      constructor(view: EditorView) {
        this.view = view;
        this.schedule(0);
      }
      update(update: ViewUpdate): void {
        if (
          update.startState.facet(templateFacet) !==
          update.state.facet(templateFacet)
        )
          this.schedule(0);
        else if (update.docChanged) this.schedule(PAGINATION_DELAY_MS);
      }
      schedule(delay: number): void {
        if (this.timer !== null) clearTimeout(this.timer);
        this.timer = setTimeout(() => {
          this.timer = null;
          this.run();
        }, delay);
      }
      run(): void {
        const { state } = this.view;
        const template = state.facet(templateFacet);
        if (template === null) return;
        const model = paginate(state.field(scriptField).elements, template);
        const map = pageMap(model, state, template.page.margin);
        this.view.dispatch({ effects: setPageMap.of(map) });
        onPages(map, this.view);
      }
      destroy(): void {
        if (this.timer !== null) clearTimeout(this.timer);
      }
    },
  );
}
