<script lang="ts">
  import ElementPicker from "../../components/ElementPicker.svelte";
  import Menu from "../../components/Menu.svelte";
  import ViewMenu from "../../components/ViewMenu.svelte";
  import { t } from "../../i18n/index.ts";
  import type { MenuItem } from "../../lib/menu.ts";
  import { session } from "../../lib/session.svelte.ts";
  import { templates } from "../../lib/templates.ts";

  /** The editor's toolbar when the script is kept on the server. */
  let {
    title,
    writer,
    rename,
    back,
    extra = [],
  }: {
    title: string;
    writer: boolean;
    rename: () => void;
    back: () => void;
    /** More Script menu entries (snapshots, export). */
    extra?: MenuItem[];
  } = $props();

  const items: MenuItem[] = $derived([
    ...(writer
      ? [{ label: "scripts.rename" as const, keys: null, run: rename }]
      : []),
    ...extra,
  ]);
</script>

<header class="toolbar" aria-label={t("toolbar.label")}>
  <button type="button" class="control quiet" onclick={back}>
    {t("editor.scripts")}
  </button>
  <button
    type="button"
    class="control quiet scenes-toggle"
    aria-expanded={session.navigatorOpen}
    aria-controls="scene-navigator"
    onclick={() => (session.navigatorOpen = !session.navigatorOpen)}
  >
    {t("toolbar.scenes")}
  </button>
  {#if items.length > 0}
    <Menu label={t("editor.scriptMenu")} id="script-menu" {items} />
  {/if}
  <ViewMenu />
  <ElementPicker />
  <span class="name" {title}>{title}</span>
  <span class="spacer"></span>
  <label class="field">
    <span class="label">{t("toolbar.template")}</span>
    <select class="control" bind:value={session.templateId} disabled={!writer}>
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
  .name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 600;
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
