<script lang="ts">
  import type { Snippet } from "svelte";

  /**
   * A modal question. Escape and the browser's own close cancel it. The
   * first field or button inside gets the focus.
   */
  let {
    title,
    open,
    cancel,
    children,
    actions,
  }: {
    title: string;
    open: boolean;
    cancel: () => void;
    children?: Snippet;
    actions: Snippet;
  } = $props();

  let dialog: HTMLDialogElement | undefined = $state();
  const id = `dialog-${crypto.randomUUID()}`;

  $effect(() => {
    if (dialog === undefined) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  });
</script>

<dialog
  bind:this={dialog}
  aria-labelledby={id}
  oncancel={(event) => {
    event.preventDefault();
    cancel();
  }}
>
  <h2 {id}>{title}</h2>
  {#if children !== undefined}
    <div class="body">{@render children()}</div>
  {/if}
  <div class="actions">{@render actions()}</div>
</dialog>

<style>
  dialog {
    width: min(28rem, calc(100vw - 32px));
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
  h2 {
    margin: 0 0 calc(var(--space) * 2);
    font-size: var(--text-lg);
    font-weight: 600;
  }
  .body {
    margin-bottom: calc(var(--space) * 3);
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: var(--space);
  }
</style>
