import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { Compartment, Prec, type Extension } from "@codemirror/state";
import { EditorView, keymap, type KeyBinding } from "@codemirror/view";
import type { Template } from "@pagework/templates";
import {
  enter,
  joinBackward,
  joinForward,
  setElement,
  shiftTab,
  tab,
  toggleEmphasis,
} from "./commands.ts";
import { SHORTCUT_ELEMENTS } from "./elements.ts";
import { typingInput } from "./input.ts";
import { elementEditing, intents } from "./intents.ts";
import { pageMapField, type PageMap } from "./pages.ts";
import { pagination } from "./pagination.ts";
import { pasteHandling } from "./paste.ts";
import { scriptField } from "./script.ts";
import { acceptSuggestion, dismissSuggestion, suggestions } from "./suggest.ts";
import {
  labelsFacet,
  layoutFacet,
  pageView,
  templateFacet,
  type Layout,
  type ViewLabels,
} from "./view.ts";

/** Ctrl/Cmd+1 to 7 set an element, and Ctrl/Cmd+Alt with the same digits where the browser keeps Ctrl+digit for tabs. */
function elementKeys(): KeyBinding[] {
  return SHORTCUT_ELEMENTS.flatMap((element, i) => {
    const run = setElement(element);
    const digit = String(i + 1);
    return [
      { key: `Mod-${digit}`, run, preventDefault: true },
      { key: `Mod-Alt-${digit}`, run, preventDefault: true },
    ];
  });
}

const writingKeys: KeyBinding[] = [
  { key: "Enter", run: (view) => acceptSuggestion(view) || enter(view) },
  {
    key: "Tab",
    run: (view) => acceptSuggestion(view) || tab(view),
    shift: shiftTab,
    preventDefault: true,
  },
  { key: "Escape", run: dismissSuggestion },
  { key: "Backspace", run: joinBackward },
  { key: "Delete", run: joinForward },
  { key: "Mod-b", run: toggleEmphasis("**"), preventDefault: true },
  { key: "Mod-i", run: toggleEmphasis("*"), preventDefault: true },
  { key: "Mod-u", run: toggleEmphasis("_"), preventDefault: true },
  ...elementKeys(),
];

export interface ScriptEditorOptions {
  template: Template;
  label: string;
  /** The writer's language, for the browser's spellcheck. */
  lang: string;
  layout: Layout;
  showFountain: boolean;
  labels: ViewLabels;
  onPages: (map: PageMap, view: EditorView) => void;
}

export interface ScriptEditor {
  extensions: Extension;
  template: Compartment;
  /** Formatted editing, or the Fountain text as it is ("Show Fountain"). */
  editing: Compartment;
  layout: Compartment;
}

/** Everything the script editor adds to CodeMirror. */
export function scriptEditor(options: ScriptEditorOptions): ScriptEditor {
  const template = new Compartment();
  const editing = new Compartment();
  const layout = new Compartment();
  return {
    template,
    editing,
    layout,
    extensions: [
      history(),
      scriptField,
      intents(),
      editing.of(elementEditing.of(!options.showFountain)),
      layout.of(layoutFacet.of(options.layout)),
      labelsFacet.of(options.labels),
      template.of(templateFacet.of(options.template)),
      pageMapField,
      suggestions(),
      pageView(),
      pagination(options.onPages),
      typingInput(),
      pasteHandling(),
      // In the Fountain view, keys behave as in a plain text editor.
      Prec.high(
        keymap.of(
          writingKeys.map((binding) => ({
            ...binding,
            run: (view: EditorView) =>
              view.state.facet(elementEditing) &&
              (binding.run?.(view) ?? false),
          })),
        ),
      ),
      keymap.of([...defaultKeymap, ...historyKeymap]),
      EditorView.lineWrapping,
      EditorView.contentAttributes.of({
        "aria-label": options.label,
        "aria-multiline": "true",
        spellcheck: "true",
        lang: options.lang,
        autocapitalize: "sentences",
      }),
    ],
  };
}

export { elementEditing, layoutFacet, templateFacet };
