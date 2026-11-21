<script lang="ts">
  import { t } from "../../i18n/index.ts";
  import { errorMessage } from "../api.ts";
  import Dialog from "./Dialog.svelte";

  /** "Delete …?" and the like: says what happens, then does it. */
  let {
    title,
    message,
    action,
    busyAction,
    open,
    close,
    confirm,
  }: {
    title: string;
    message: string;
    action: string;
    busyAction: string;
    open: boolean;
    close: () => void;
    confirm: () => Promise<void>;
  } = $props();

  let busy = $state(false);
  let problem: string | null = $state(null);

  $effect(() => {
    if (open) problem = null;
  });

  async function run(): Promise<void> {
    if (busy) return;
    busy = true;
    try {
      await confirm();
      close();
    } catch (error) {
      problem = errorMessage(error);
    } finally {
      busy = false;
    }
  }
</script>

<Dialog {title} {open} cancel={close}>
  <p>{message}</p>
  {#if problem !== null}
    <p class="form-error" role="alert">{problem}</p>
  {/if}
  {#snippet actions()}
    <button type="button" class="control" onclick={close}>
      {t("question.cancel")}
    </button>
    <button
      type="button"
      class="control primary"
      disabled={busy}
      onclick={() => void run()}
    >
      {busy ? busyAction : action}
    </button>
  {/snippet}
</Dialog>

<style>
  p {
    margin: 0 0 var(--space);
  }
</style>
