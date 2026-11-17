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
import { pageView, templateFacet } from "./view.ts";

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
  onPages: (map: PageMap, view: EditorView) => void;
}

/** Everything the script editor adds to CodeMirror. */
export function scriptEditor(options: ScriptEditorOptions): {
  extensions: Extension;
  template: Compartment;
} {
  const template = new Compartment();
  return {
    template,
    extensions: [
      history(),
      scriptField,
      intents(),
      elementEditing.of(true),
      template.of(templateFacet.of(options.template)),
      pageMapField,
      suggestions(),
      pageView(),
      pagination(options.onPages),
      typingInput(),
      pasteHandling(),
      Prec.high(keymap.of(writingKeys)),
      keymap.of([...defaultKeymap, ...historyKeymap]),
      EditorView.lineWrapping,
      EditorView.contentAttributes.of({
        "aria-label": options.label,
        "aria-multiline": "true",
        spellcheck: "true",
        autocapitalize: "sentences",
      }),
    ],
  };
}

export { templateFacet };
