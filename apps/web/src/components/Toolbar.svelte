<script lang="ts">
  import { t } from "../i18n/index.ts";
  import { session } from "../lib/session.svelte.ts";
  import { templates } from "../lib/templates.ts";
  import ElementPicker from "./ElementPicker.svelte";
</script>

<header class="toolbar" aria-label={t("toolbar.label")}>
  <button
    type="button"
    class="control quiet scenes-toggle"
    aria-expanded={session.navigatorOpen}
    aria-controls="scene-navigator"
    onclick={() => (session.navigatorOpen = !session.navigatorOpen)}
  >
    {t("toolbar.scenes")}
  </button>
  <ElementPicker />
  <span class="spacer"></span>
  <label class="field">
    <span class="label">{t("toolbar.template")}</span>
    <select class="control" bind:value={session.templateId}>
      {#each templates as template (template.id)}
        <option value={template.id}>{template.name}</option>
      {/each}
    </select>
  </label>
</header>

<style>
  .toolbar {
    display: flex;
    align-items: center;
    gap: var(--space);
    height: var(--toolbar-height);
    padding: 0 var(--space);
    background: var(--chrome);
    border-bottom: 1px solid var(--border);
    overflow-x: auto;
  }
  .spacer {
    flex: 1;
  }
  .field {
    display: flex;
    align-items: center;
    gap: var(--space);
    white-space: nowrap;
  }
  .label {
    color: var(--text-muted);
    font-size: var(--text-sm);
  }
  @media (min-width: 900px) {
    .scenes-toggle {
      display: none;
    }
  }
</style>
