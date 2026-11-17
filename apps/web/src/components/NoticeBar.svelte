<script lang="ts">
  import { t } from "../i18n/index.ts";
  import { dismissOffer, doc, restoreOffer } from "../lib/document.svelte.ts";

  const time = new Intl.DateTimeFormat("en-AU", {
    dateStyle: "medium",
    timeStyle: "short",
  });
</script>

{#if doc.offer !== null}
  <div class="bar" role="region" aria-label={t("notice.restoreLabel")}>
    <p>
      {t(
        doc.offer.fileName === null
          ? "notice.restoreUntitled"
          : "notice.restore",
        {
          name: doc.offer.fileName ?? "",
          time: time.format(doc.offer.updatedAt),
        },
      )}
    </p>
    <button type="button" class="control primary" onclick={restoreOffer}>
      {t("notice.restoreAction")}
    </button>
    <button type="button" class="control" onclick={dismissOffer}>
      {t("notice.notNow")}
    </button>
  </div>
{:else if doc.notice !== null}
  <div
    class="bar"
    class:error={doc.notice.kind === "error"}
    role={doc.notice.kind === "error" ? "alert" : "status"}
  >
    <p>{doc.notice.message}</p>
    <button type="button" class="control" onclick={() => (doc.notice = null)}>
      {t("notice.dismiss")}
    </button>
  </div>
{/if}

<style>
  .bar {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--space);
    padding: var(--space) calc(var(--space) * 1.5);
    background: var(--surface);
    border-bottom: 1px solid var(--border);
  }
  .bar.error p {
    color: var(--state-error);
  }
  p {
    flex: 1 1 20rem;
    margin: 0;
  }
  .primary {
    background: var(--action);
    border-color: var(--action);
    color: var(--on-action);
  }
  .primary:hover {
    background: var(--action);
  }
</style>
