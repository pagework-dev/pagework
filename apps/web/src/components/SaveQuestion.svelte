<script lang="ts">
  import { t } from "../i18n/index.ts";
  import { doc } from "../lib/document.svelte.ts";

  let dialog: HTMLDialogElement | undefined = $state();

  $effect(() => {
    if (doc.question !== null && dialog !== undefined && !dialog.open)
      dialog.showModal();
  });

  function answer(value: "save" | "discard" | "cancel"): void {
    const question = doc.question;
    dialog?.close();
    question?.resolve(value);
  }
</script>

<dialog
  bind:this={dialog}
  aria-labelledby="save-question"
  oncancel={(event) => {
    event.preventDefault();
    answer("cancel");
  }}
>
  <p id="save-question">{doc.question?.message ?? ""}</p>
  <div class="actions">
    <button type="button" class="control" onclick={() => answer("cancel")}>
      {t("question.cancel")}
    </button>
    <button type="button" class="control" onclick={() => answer("discard")}>
      {t("question.dontSave")}
    </button>
    <button
      type="button"
      class="control primary"
      onclick={() => answer("save")}
    >
      {t("question.save")}
    </button>
  </div>
</dialog>

<style>
  dialog {
    max-width: min(28rem, calc(100vw - 32px));
    padding: calc(var(--space) * 3);
    border: 1px solid var(--border-control);
    border-radius: var(--radius);
    background: var(--surface);
    color: var(--text);
  }
  dialog::backdrop {
    background: var(--desk);
    opacity: 0.6;
  }
  p {
    margin: 0 0 calc(var(--space) * 3);
    font-size: var(--text-lg);
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: var(--space);
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
