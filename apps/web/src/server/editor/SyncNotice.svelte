<script lang="ts">
  import { t } from "../../i18n/index.ts";
  import { errorMessage } from "../api.ts";
  import { go } from "../router.svelte.ts";
  import type { ScriptSync } from "../sync.svelte.ts";

  /**
   * The bar under the toolbar when the script can't be saved (DESIGN.md,
   * States: say what happened and that editing is paused), or when the
   * writer may only read it.
   */
  let {
    sync,
    writer,
    leaveAnyway,
    problem,
    dismissProblem,
  }: {
    sync: ScriptSync;
    writer: boolean;
    leaveAnyway: boolean;
    problem: string | null;
    dismissProblem: () => void;
  } = $props();

  const syncState = $derived(sync.status.state);
  const message = $derived.by(() => {
    switch (syncState) {
      case "offline":
        return t("sync.offline");
      case "failing":
        return t("sync.failing", { reason: errorMessage(sync.status.failure) });
      case "signedOut":
        return t("sync.signedOut");
      case "gone":
        return t("sync.gone");
      case "readOnly":
        return t("sync.readOnly");
      default:
        return writer ? null : t("sync.readOnly");
    }
  });
  const paused = $derived(
    syncState === "offline" ||
      syncState === "failing" ||
      syncState === "signedOut",
  );
</script>

{#if message !== null}
  <div class="bar" class:error={paused || syncState === "gone"} role="alert">
    <p>
      {message}
      {#if leaveAnyway && paused}
        {t("sync.leaveAnyway")}
      {/if}
    </p>
    {#if syncState === "signedOut"}
      <a class="control link" href="/" target="_blank" rel="noopener">
        {t("sync.signInTab")}
      </a>
    {/if}
    {#if paused}
      <button type="button" class="control" onclick={() => sync.retry()}>
        {t("unreachable.retry")}
      </button>
    {/if}
    {#if syncState === "gone"}
      <button
        type="button"
        class="control"
        onclick={() => void go({ screen: "scripts" })}
      >
        {t("editor.backToScripts")}
      </button>
    {/if}
  </div>
{:else if problem !== null}
  <div class="bar error" role="alert">
    <p>{problem}</p>
    <button type="button" class="control" onclick={dismissProblem}>
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
  .link {
    display: inline-flex;
    align-items: center;
    text-decoration: none;
  }
</style>
