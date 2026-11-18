<script lang="ts">
  import { setElement } from "../editor/commands.ts";
  import {
    SCRIPT_ELEMENTS,
    SHORTCUT_ELEMENTS,
    isScriptElement,
    type ScriptElement,
  } from "../editor/elements.ts";
  import { t } from "../i18n/index.ts";
  import { editorView } from "../lib/editor-view.ts";
  import { kindLabel } from "../lib/labels.ts";
  import { session } from "../lib/session.svelte.ts";

  const mac = /Mac|iPhone|iPad/.test(navigator.userAgent);

  function optionLabel(element: ScriptElement): string {
    const index = SHORTCUT_ELEMENTS.indexOf(element);
    if (index === -1) return kindLabel(element);
    const key = String(index + 1);
    return t("picker.withShortcut", {
      element: kindLabel(element),
      shortcut: t(mac ? "shortcut.mac" : "shortcut.other", { key }),
    });
  }

  function choose(event: Event): void {
    const value = (event.currentTarget as HTMLSelectElement).value;
    const view = editorView();
    if (view === null || !isScriptElement(value)) return;
    setElement(value)(view);
    view.focus();
  }

  const current = $derived(
    isScriptElement(session.currentKind) ? session.currentKind : "",
  );
</script>

<label class="picker">
  <span class="visually-hidden">{t("toolbar.element")}</span>
  <select class="control" value={current} onchange={choose}>
    {#if current === ""}
      <option value="" disabled>{kindLabel(session.currentKind)}</option>
    {/if}
    {#each SCRIPT_ELEMENTS as element (element)}
      <option value={element}>{optionLabel(element)}</option>
    {/each}
  </select>
</label>

<style>
  .picker select {
    min-width: 12em;
  }
</style>
