<script lang="ts">
  import { t } from "../../i18n/index.ts";
  import { errorMessage } from "../api.ts";
  import Dialog from "./Dialog.svelte";

  /** Asks for a name or title, and runs `submit` with it. */
  let {
    title,
    label,
    action,
    busyAction,
    initial = "",
    open,
    close,
    submit,
    allowEmpty = false,
  }: {
    title: string;
    label: string;
    action: string;
    busyAction: string;
    initial?: string;
    open: boolean;
    close: () => void;
    submit: (value: string) => Promise<void>;
    allowEmpty?: boolean;
  } = $props();

  let value = $state("");
  let busy = $state(false);
  let problem: string | null = $state(null);
  let input: HTMLInputElement | undefined = $state();
  const formId = `text-dialog-${crypto.randomUUID()}`;

  $effect(() => {
    if (open) {
      value = initial;
      problem = null;
      queueMicrotask(() => input?.select());
    }
  });

  async function run(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    if (busy || (!allowEmpty && value.trim() === "")) return;
    busy = true;
    problem = null;
    try {
      await submit(value);
      close();
    } catch (error) {
      problem = errorMessage(error);
    } finally {
      busy = false;
    }
  }
</script>

<Dialog {title} {open} cancel={close}>
  <form class="form" id={formId} onsubmit={run} novalidate>
    <label class="form-field">
      <span>{label}</span>
      <input class="input" bind:this={input} bind:value maxlength="200" />
    </label>
    {#if problem !== null}
      <p class="form-error" role="alert">{problem}</p>
    {/if}
  </form>
  {#snippet actions()}
    <button type="button" class="control" onclick={close}>
      {t("question.cancel")}
    </button>
    <button
      type="submit"
      form={formId}
      class="control primary"
      disabled={busy || (!allowEmpty && value.trim() === "")}
    >
      {busy ? busyAction : action}
    </button>
  {/snippet}
</Dialog>
