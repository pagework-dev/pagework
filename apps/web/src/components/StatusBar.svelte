<script lang="ts">
  import { t } from "../i18n/index.ts";
  import { session } from "../lib/session.svelte.ts";
  import { kindLabel } from "../lib/labels.ts";
</script>

<footer class="status" aria-label={t("status.label")}>
  <span>
    {session.pageCount === null
      ? t("status.pageCounting")
      : t(session.pageCount === 1 ? "status.pages.one" : "status.pages.other", {
          pages: session.pageCount,
        })}
  </span>
  <span class="scene">
    {session.currentScene === null
      ? t("status.noScene")
      : t("status.scene", { number: session.currentScene.number })}
  </span>
  <span>{kindLabel(session.currentKind)}</span>
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
  .scene {
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
