<script lang="ts">
  import { t } from "../i18n/index.ts";
  import { doc } from "../lib/document.svelte.ts";
  import { kindLabel } from "../lib/labels.ts";
  import { session } from "../lib/session.svelte.ts";

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
  {#if doc.busy !== null}
    <span>{t(doc.busy === "pdf" ? "busy.pdf" : "busy.print")}</span>
  {/if}
  {#if doc.saveState !== "empty"}
    <span class:warning={doc.saveState === "unsaved"}>
      {t(`save.${doc.saveState}`)}
    </span>
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
