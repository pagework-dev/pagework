<script lang="ts">
  import { t } from "../i18n/index.ts";
  import type { MenuItem } from "../lib/menu.ts";

  let { label, id, items }: { label: string; id: string; items: MenuItem[] } =
    $props();

  let open = $state(false);
  /** The toolbar scrolls sideways on narrow screens, so the menu is placed on the page, under its button. */
  let place = $state({ top: 0, left: 0 });
  let button: HTMLButtonElement;
  let menu: HTMLDivElement | undefined = $state();

  function entries(): HTMLButtonElement[] {
    return [
      ...(menu?.querySelectorAll<HTMLButtonElement>("[role=menuitem]") ?? []),
    ];
  }

  function show(focusLast = false): void {
    const rect = button.getBoundingClientRect();
    place = { top: rect.bottom + 4, left: Math.max(8, rect.left) };
    open = true;
    queueMicrotask(() => {
      const list = entries();
      (focusLast ? list.at(-1) : list[0])?.focus();
    });
  }

  function hide(returnFocus: boolean): void {
    open = false;
    if (returnFocus) button.focus();
  }

  function choose(item: MenuItem): void {
    hide(false);
    void item.run();
  }

  function onMenuKey(event: KeyboardEvent): void {
    const list = entries();
    const at = list.indexOf(document.activeElement as HTMLButtonElement);
    const move = (to: number): void => {
      event.preventDefault();
      list[(to + list.length) % list.length]?.focus();
    };
    if (event.key === "ArrowDown") move(at + 1);
    else if (event.key === "ArrowUp") move(at - 1);
    else if (event.key === "Home") move(0);
    else if (event.key === "End") move(list.length - 1);
    else if (event.key === "Escape") {
      event.preventDefault();
      hide(true);
    } else if (event.key === "Tab") hide(false);
  }

  function onButtonKey(event: KeyboardEvent): void {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      show();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      show(true);
    }
  }
</script>

<svelte:window
  onpointerdown={(event) => {
    if (
      open &&
      !(event.target instanceof Node && menu?.contains(event.target)) &&
      event.target !== button
    )
      hide(false);
  }}
/>

<div class="file-menu">
  <button
    bind:this={button}
    type="button"
    class="control quiet"
    aria-haspopup="menu"
    aria-expanded={open}
    aria-controls={id}
    onclick={() => (open ? hide(false) : show())}
    onkeydown={onButtonKey}
  >
    {label}
  </button>
  {#if open}
    <div
      bind:this={menu}
      {id}
      class="menu"
      style:top="{place.top}px"
      style:left="{place.left}px"
      role="menu"
      tabindex="-1"
      aria-label={label}
      onkeydown={onMenuKey}
    >
      {#each items as item (item.label)}
        <button
          type="button"
          role={item.checked === undefined
            ? "menuitem"
            : item.radio === true
              ? "menuitemradio"
              : "menuitemcheckbox"}
          aria-checked={item.checked}
          class="item"
          tabindex="-1"
          disabled={item.disabled === true}
          onclick={() => {
            choose(item);
          }}
        >
          <span><span class="check"></span>{t(item.label)}</span>
          {#if item.keys !== null}<span class="keys">{item.keys}</span>{/if}
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .file-menu {
    position: relative;
  }
  .menu {
    position: fixed;
    z-index: 10;
    min-width: 16rem;
    padding: calc(var(--space) / 2) 0;
    background: var(--surface);
    border: 1px solid var(--border-control);
    border-radius: var(--radius);
    box-shadow: var(--page-shadow);
  }
  .item {
    display: flex;
    justify-content: space-between;
    gap: calc(var(--space) * 3);
    width: 100%;
    min-height: var(--control);
    padding: 0 calc(var(--space) * 1.5);
    border: 0;
    background: transparent;
    text-align: left;
    cursor: pointer;
  }
  .item:hover,
  .item:focus-visible {
    background: var(--selection);
    outline: none;
  }
  .item:disabled {
    color: var(--text-muted);
    cursor: default;
  }
  .check {
    display: inline-block;
    width: 1.5em;
  }
  [aria-checked="true"] .check::before {
    content: "✓";
  }
  .keys {
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
  }
</style>
