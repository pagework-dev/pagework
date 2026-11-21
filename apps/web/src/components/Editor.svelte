<script lang="ts">
  import { Compartment, EditorState } from "@codemirror/state";
  import { EditorView, type ViewUpdate } from "@codemirror/view";
  import { onMount } from "svelte";
  import {
    elementEditing,
    layoutFacet,
    scriptEditor,
    templateFacet,
  } from "../editor/index.ts";
  import { elementOfLine } from "../editor/intents.ts";
  import { pageAt, pageMapField } from "../editor/pages.ts";
  import { scriptField } from "../editor/script.ts";
  import { templateVariables } from "../editor/view.ts";
  import { t } from "../i18n/index.ts";
  import { textChanged } from "../lib/document.svelte.ts";
  import { setEditorView } from "../lib/editor-view.ts";
  import { sceneAt, sameScenes, scenesOf } from "../lib/scenes.ts";
  import { rememberLayout, session } from "../lib/session.svelte.ts";
  import { templateById } from "../lib/templates.ts";

  let {
    onChange = () => {
      textChanged();
    },
    editable = true,
  }: {
    /** Called for every change to the text. Local mode keeps a draft. */
    onChange?: (update: ViewUpdate) => void;
    /** False while editing is paused or the writer may only read. */
    editable?: boolean;
  } = $props();

  let host: HTMLDivElement;
  const editability = new Compartment();
  const editableExtensions = (on: boolean) => [
    EditorView.editable.of(on),
    EditorState.readOnly.of(!on),
  ];

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
    /** Scenes are listed when pages are counted, not on every keystroke. */
    const report = (view: EditorView, scenesToo: boolean): void => {
      const { state } = view;
      const script = state.field(scriptField);
      if (scenesToo) {
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
      lang: navigator.language,
      layout: session.layout,
      showFountain: session.showFountain,
      labels: { pageBreak: (page) => t("view.pageBreak", { page }) },
      onPages: (map, view) => {
        session.pageCount = map.pages;
        report(view, true);
      },
    });
    const createState = (text: string): EditorState =>
      EditorState.create({
        doc: text,
        extensions: [
          editor.extensions,
          editability.of(editableExtensions(editable)),
          EditorView.updateListener.of((update) => {
            if (update.focusChanged)
              session.editorFocused = update.view.hasFocus;
            if (update.docChanged) onChange(update);
            if (
              update.docChanged ||
              update.selectionSet ||
              update.transactions.length > 0
            )
              report(update.view, false);
          }),
        ],
      });
    const view = new EditorView({ parent: host, state: createState("") });
    const currentModes = () => [
      editor.template.reconfigure(
        templateFacet.of(templateById(session.templateId)),
      ),
      editor.layout.reconfigure(layoutFacet.of(session.layout)),
      editor.editing.reconfigure(elementEditing.of(!session.showFountain)),
      editability.reconfigure(editableExtensions(editable)),
    ];
    const load = (text: string): void => {
      view.setState(createState(text));
      // A new state starts with the settings the editor was created with.
      view.dispatch({ effects: currentModes() });
      session.pageCount = null;
      report(view, true);
      host.parentElement?.scrollTo(0, 0);
    };
    setEditorView(view, load);
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

    const stopModeWatch = $effect.root(() => {
      $effect(() => {
        const layout = session.layout;
        const source = session.showFountain;
        rememberLayout(layout);
        host.classList.toggle("pw-reflow", layout === "reflow" && !source);
        host.classList.toggle("pw-source", source);
        if (
          view.state.facet(layoutFacet) !== layout ||
          view.state.facet(elementEditing) === source
        )
          view.dispatch({
            effects: [
              editor.layout.reconfigure(layoutFacet.of(layout)),
              editor.editing.reconfigure(elementEditing.of(!source)),
            ],
          });
      });
    });

    const stopEditableWatch = $effect.root(() => {
      $effect(() => {
        const on = editable;
        if (view.state.facet(EditorView.editable) === on) return;
        view.dispatch({
          effects: editability.reconfigure(editableExtensions(on)),
        });
      });
    });

    return () => {
      stopEditableWatch();
      stopModeWatch();
      stopTemplateWatch();
      resize.disconnect();
      setEditorView(null);
      view.destroy();
    };
  });
</script>

<div class="pw-page" bind:this={host}></div>
