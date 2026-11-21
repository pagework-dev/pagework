<script lang="ts">
  import type { Snippet } from "svelte";

  /**
   * Shows its content only after a pause (DESIGN.md, States: nothing for
   * the first 300 ms), so fast loads never flash a loading message.
   */
  let { children, ms = 300 }: { children: Snippet; ms?: number } = $props();
  let shown = $state(false);

  $effect(() => {
    const timer = setTimeout(() => (shown = true), ms);
    return () => {
      clearTimeout(timer);
    };
  });
</script>

{#if shown}
  {@render children()}
{/if}
