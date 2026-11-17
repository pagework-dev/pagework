<script lang="ts">
  import { history, historyKeymap, defaultKeymap } from "@codemirror/commands";
  import { EditorState } from "@codemirror/state";
  import { EditorView, keymap } from "@codemirror/view";
  import { onMount } from "svelte";
  import { scriptField } from "../editor/script.ts";
  import { lineKind } from "../editor/lines.ts";
  import { paginationScheduler } from "../editor/pagination.ts";
  import { sceneAt, sameScenes, scenesOf } from "../lib/scenes.ts";
  import { session } from "../lib/session.svelte.ts";
  import { templateById } from "../lib/templates.ts";
  import { t } from "../i18n/index.ts";
  import { setEditorView } from "../lib/editor-view.ts";

  let host: HTMLDivElement;

  onMount(() => {
    const pages = paginationScheduler(
      () => templateById(session.templateId),
      (model) => {
        session.pageCount = model.pages.filter(
          (p) => p.kind === "script",
        ).length;
      },
    );

    const report = (view: EditorView, docChanged: boolean): void => {
      const script = view.state.field(scriptField);
      if (docChanged) {
        const scenes = scenesOf(script.elements);
        if (!sameScenes(scenes, session.scenes)) session.scenes = scenes;
        pages.schedule(view);
      }
      const line = view.state.doc.lineAt(view.state.selection.main.head).number;
      session.currentKind = lineKind(script.elements, line);
      session.currentScene = sceneAt(session.scenes, line);
    };

    const view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: "",
        extensions: [
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          scriptField,
          EditorView.lineWrapping,
          EditorView.contentAttributes.of({
            "aria-label": t("editor.label"),
            spellcheck: "true",
          }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged || update.selectionSet)
              report(update.view, update.docChanged);
          }),
        ],
      }),
    });
    setEditorView(view);
    report(view, true);
    view.focus();

    const stopTemplateWatch = $effect.root(() => {
      $effect(() => {
        void session.templateId;
        session.pageCount = null;
        pages.schedule(view);
      });
    });

    return () => {
      stopTemplateWatch();
      pages.cancel();
      setEditorView(null);
      view.destroy();
    };
  });
</script>

<div class="page" bind:this={host}></div>

<style>
  .page {
    width: min(100%, 8.5in);
    min-height: 11in;
    margin: calc(var(--space) * 3) auto;
    background: var(--page);
    color: var(--page-text);
    box-shadow: var(--page-shadow);
  }
  .page :global(.cm-editor) {
    min-height: 11in;
  }
  .page :global(.cm-editor.cm-focused) {
    outline: none;
  }
  .page :global(.cm-scroller) {
    font-family: var(--font-script);
    font-size: 12pt;
    line-height: 12pt;
  }
  .page :global(.cm-content) {
    padding: 1in 1in 1in 1.5in;
    caret-color: var(--page-text);
  }
  .page :global(.cm-selectionBackground),
  .page :global(.cm-focused .cm-selectionBackground) {
    background: var(--page-selection);
  }
</style>
