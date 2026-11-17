<script lang="ts">
  import { EditorState } from "@codemirror/state";
  import { EditorView } from "@codemirror/view";
  import { onMount } from "svelte";
  import { scriptEditor, templateFacet } from "../editor/index.ts";
  import { elementOfLine } from "../editor/intents.ts";
  import { pageAt, pageMapField } from "../editor/pages.ts";
  import { scriptField } from "../editor/script.ts";
  import { templateVariables } from "../editor/view.ts";
  import { t } from "../i18n/index.ts";
  import { setEditorView } from "../lib/editor-view.ts";
  import { sceneAt, sameScenes, scenesOf } from "../lib/scenes.ts";
  import { session } from "../lib/session.svelte.ts";
  import { templateById } from "../lib/templates.ts";

  let host: HTMLDivElement;

  /** Points to CSS pixels at 100%: 1 pt is 1/72 in, 1 px is 1/96 in. */
  const PX_PER_PT = 96 / 72;
  /** Space kept either side of the page when it is zoomed to fit. */
  const SIDE_GUTTER_PX = 16;

  function applyTemplate(id: string): void {
    const template = templateById(id);
    for (const [name, value] of Object.entries(templateVariables(template)))
      host.style.setProperty(name, value);
    fitWidth();
  }

  function fitWidth(): void {
    const desk = host.parentElement;
    if (desk === null) return;
    const template = templateById(session.templateId);
    const pageWidth = template.page.width * PX_PER_PT;
    const available = desk.clientWidth - 2 * SIDE_GUTTER_PX;
    const scale = Math.min(1, Math.max(0.3, available / pageWidth));
    host.style.setProperty("--pt", `${String(PX_PER_PT * scale)}px`);
  }

  onMount(() => {
    const report = (view: EditorView, docChanged: boolean): void => {
      const { state } = view;
      const script = state.field(scriptField);
      if (docChanged) {
        const scenes = scenesOf(script.elements);
        if (!sameScenes(scenes, session.scenes)) session.scenes = scenes;
      }
      const head = state.selection.main.head;
      const line = state.doc.lineAt(head).number;
      session.currentKind = elementOfLine(state, line);
      session.currentScene = sceneAt(session.scenes, line);
      session.currentPage = pageAt(state.field(pageMapField), head);
    };

    applyTemplate(session.templateId);
    const editor = scriptEditor({
      template: templateById(session.templateId),
      label: t("editor.label"),
      onPages: (map, view) => {
        session.pageCount = map.pages;
        report(view, false);
      },
    });
    const view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: "",
        extensions: [
          editor.extensions,
          EditorView.updateListener.of((update) => {
            if (
              update.docChanged ||
              update.selectionSet ||
              update.transactions.length > 0
            )
              report(update.view, update.docChanged);
          }),
        ],
      }),
    });
    setEditorView(view);
    report(view, true);
    view.focus();

    const resize = new ResizeObserver(() => {
      fitWidth();
    });
    if (host.parentElement !== null) resize.observe(host.parentElement);

    const stopTemplateWatch = $effect.root(() => {
      $effect(() => {
        const id = session.templateId;
        if (view.state.facet(templateFacet)?.id === id) return;
        applyTemplate(id);
        session.pageCount = null;
        view.dispatch({
          effects: editor.template.reconfigure(
            templateFacet.of(templateById(id)),
          ),
        });
      });
    });

    return () => {
      stopTemplateWatch();
      resize.disconnect();
      setEditorView(null);
      view.destroy();
    };
  });
</script>

<div class="pw-page" bind:this={host}></div>
