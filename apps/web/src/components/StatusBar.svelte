<script lang="ts">
  import { t } from "../i18n/index.ts";
  import { kindLabel } from "../lib/labels.ts";
  import { session } from "../lib/session.svelte.ts";

  let {
    save = null,
    busy = null,
  }: {
    /** Where the script is kept: "Saved", "Saving…" and so on. */
    save?: { label: string; warning: boolean } | null;
    /** Work in progress, such as exporting. */
    busy?: string | null;
  } = $props();

  const pages = $derived.by(() => {
    if (session.pageCount === null) return t("status.pageCounting");
    if (session.currentPage === 0) return t("status.titlePage");
    if (session.currentPage === null)
      return t(
        session.pageCount === 1 ? "status.pages.one" : "status.pages.other",
        {
          pages: session.pageCount,
        },
      );
    return t("status.page", {
      page: session.currentPage,
      pages: session.pageCount,
    });
  });
</script>

<footer class="status" aria-label={t("status.label")}>
  <span>{pages}</span>
  <span class="scene">
    {session.currentScene === null
      ? t("status.noScene")
      : t("status.scene", { number: session.currentScene.number })}
  </span>
  <span>{kindLabel(session.currentKind)}</span>
  <span class="spacer"></span>
  {#if busy !== null}
    <span>{busy}</span>
  {/if}
  {#if save !== null}
    <span class:warning={save.warning}>{save.label}</span>
  {/if}
</footer>

<style>
  .status {
    display: flex;
    align-items: center;
    gap: calc(var(--space) * 3);
    height: var(--status-height);
    padding: 0 calc(var(--space) * 1.5);
    background: var(--chrome);
    border-top: 1px solid var(--border);
    color: var(--text-muted);
    font-size: var(--text-sm);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    overflow: hidden;
  }
  .spacer {
    flex: 1;
  }
  .warning {
    color: var(--state-warning);
  }
  .scene {
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
