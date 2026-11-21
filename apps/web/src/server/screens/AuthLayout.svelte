<script lang="ts">
  import type { Snippet } from "svelte";
  import { t } from "../../i18n/index.ts";

  let {
    title,
    intro = null,
    children,
    after = undefined,
  }: {
    title: string;
    intro?: string | null;
    children: Snippet;
    after?: Snippet | undefined;
  } = $props();

  $effect(() => {
    document.title = t("app.title", { name: title });
  });
</script>

<main class="screen">
  <div class="panel">
    <p class="product">{t("product.name")}</p>
    <h1>{title}</h1>
    {#if intro !== null}
      <p class="intro">{intro}</p>
    {/if}
    {@render children()}
  </div>
  {#if after !== undefined}
    <div class="after">
      {@render after()}
    </div>
  {/if}
</main>

<style>
  .screen {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: calc(var(--space) * 3);
    min-height: 100%;
    padding: calc(var(--space) * 6) calc(var(--space) * 2);
    background: var(--chrome);
    overflow-y: auto;
  }
  .panel,
  .after {
    width: 100%;
    max-width: 24rem;
  }
  .panel {
    padding: calc(var(--space) * 3);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }
  .product {
    margin: 0;
    color: var(--text-muted);
    font-size: var(--text-sm);
  }
  h1 {
    margin: 0 0 calc(var(--space) * 2);
    font-size: var(--text-xl);
    line-height: 1.3;
    font-weight: 600;
  }
  .intro {
    margin: 0 0 calc(var(--space) * 2);
  }
</style>
