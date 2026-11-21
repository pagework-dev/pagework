<script lang="ts">
  import type { Snippet } from "svelte";
  import Menu from "../components/Menu.svelte";
  import { t } from "../i18n/index.ts";
  import type { MenuItem } from "../lib/menu.ts";
  import { account, signOut } from "./account.svelte.ts";

  /** The chrome around every signed-in screen except the editor. */
  let { children, actions = [] }: { children: Snippet; actions?: MenuItem[] } =
    $props();

  const accountItems: MenuItem[] = $derived([
    ...actions,
    { label: "account.signOut", keys: null, run: signOut },
  ]);
</script>

<div class="shell">
  <header class="bar" aria-label={t("toolbar.label")}>
    <span class="product">{t("product.name")}</span>
    <span class="spacer"></span>
    <span class="who" title={account.view?.user.email ?? ""}>
      {account.view?.user.displayName ?? ""}
    </span>
    <Menu label={t("account.menu")} id="account-menu" items={accountItems} />
  </header>
  <div class="content">
    {@render children()}
  </div>
</div>

<style>
  .shell {
    display: flex;
    flex-direction: column;
    height: 100%;
  }
  .bar {
    display: flex;
    align-items: center;
    gap: var(--space);
    height: var(--toolbar-height);
    padding: 0 calc(var(--space) * 1.5);
    background: var(--chrome);
    border-bottom: 1px solid var(--border);
  }
  .product {
    font-weight: 600;
  }
  .spacer {
    flex: 1;
  }
  .who {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--text-muted);
  }
  .content {
    flex: 1;
    min-height: 0;
    overflow: auto;
    background: var(--surface);
  }
</style>
