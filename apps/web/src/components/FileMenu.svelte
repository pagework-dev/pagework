<script lang="ts">
  import { t, type MessageKey } from "../i18n/index.ts";
  import {
    doc,
    exportPdf,
    newScript,
    openScript,
    printScript,
    save,
    saveAs,
  } from "../lib/document.svelte.ts";

  const mac = /Mac|iPhone|iPad/.test(navigator.userAgent);
  const mod = mac ? "⌘" : t("shortcut.ctrl");

  interface Item {
    label: MessageKey;
    keys: string | null;
    run: () => unknown;
  }

  const items: Item[] = [
    { label: "file.new", keys: mac ? "⌥⌘N" : `${mod}+Alt+N`, run: newScript },
    { label: "file.open", keys: mac ? "⌘O" : `${mod}+O`, run: openScript },
    { label: "file.save", keys: mac ? "⌘S" : `${mod}+S`, run: save },
    { label: "file.saveAs", keys: mac ? "⇧⌘S" : `${mod}+Shift+S`, run: saveAs },
    { label: "file.exportPdf", keys: null, run: exportPdf },
    { label: "file.print", keys: mac ? "⌘P" : `${mod}+P`, run: printScript },
  ];

  let open = $state(false);
  let button: HTMLButtonElement;
  let menu: HTMLDivElement | undefined = $state();

  function entries(): HTMLButtonElement[] {
    return [
      ...(menu?.querySelectorAll<HTMLButtonElement>("[role=menuitem]") ?? []),
    ];
  }

  function show(focusLast = false): void {
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

  function choose(item: Item): void {
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
    aria-controls="file-menu"
    onclick={() => (open ? hide(false) : show())}
    onkeydown={onButtonKey}
  >
    {t("file.menu")}
  </button>
  {#if open}
    <div
      bind:this={menu}
      id="file-menu"
      class="menu"
      role="menu"
      tabindex="-1"
      aria-label={t("file.menu")}
      onkeydown={onMenuKey}
    >
      {#each items as item (item.label)}
        <button
          type="button"
          role="menuitem"
          class="item"
          tabindex="-1"
          disabled={doc.busy !== null &&
            (item.label === "file.exportPdf" || item.label === "file.print")}
          onclick={() => {
            choose(item);
          }}
        >
          <span>{t(item.label)}</span>
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
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
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
  .keys {
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
  }
</style>
