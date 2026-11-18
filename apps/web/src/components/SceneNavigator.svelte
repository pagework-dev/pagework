<script lang="ts">
  import { t } from "../i18n/index.ts";
  import { goToLine } from "../lib/editor-view.ts";
  import { session } from "../lib/session.svelte.ts";

  function choose(line: number): void {
    session.navigatorOpen = false;
    goToLine(line);
  }
</script>

<nav
  id="scene-navigator"
  class="navigator"
  class:open={session.navigatorOpen}
  aria-label={t("navigator.label")}
>
  <div class="header">
    <h2>{t("navigator.label")}</h2>
    <button
      type="button"
      class="control quiet close"
      onclick={() => (session.navigatorOpen = false)}
    >
      {t("navigator.close")}
    </button>
  </div>
  {#if session.scenes.length === 0}
    <p class="empty">{t("navigator.empty")}</p>
  {:else}
    <ol>
      {#each session.scenes as scene (scene.line)}
        <li>
          <button
            type="button"
            class="scene"
            class:current={session.currentScene?.line === scene.line}
            aria-current={session.currentScene?.line === scene.line
              ? "location"
              : undefined}
            onclick={() => choose(scene.line)}
          >
            <span class="number">{scene.number}</span>
            <span class="heading">{scene.heading}</span>
          </button>
        </li>
      {/each}
    </ol>
  {/if}
</nav>

<style>
  .navigator {
    width: var(--navigator-width);
    flex: none;
    overflow-y: auto;
    background: var(--chrome);
    border-right: 1px solid var(--border);
  }
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space) calc(var(--space) * 1.5);
  }
  h2 {
    margin: 0;
    font-size: var(--text-md);
    font-weight: 600;
  }
  .empty {
    margin: 0;
    padding: 0 calc(var(--space) * 1.5);
    color: var(--text-muted);
  }
  ol {
    list-style: none;
    margin: 0;
    padding: 0 0 var(--space);
  }
  .scene {
    display: flex;
    gap: var(--space);
    width: 100%;
    min-height: var(--control);
    padding: calc(var(--space) / 2) calc(var(--space) * 1.5);
    border: 0;
    background: transparent;
    text-align: left;
    cursor: pointer;
    transition: background-color var(--hover);
  }
  .scene:hover,
  .scene.current {
    background: var(--selection);
  }
  .number {
    flex: none;
    min-width: 3ch;
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
  }
  .heading {
    overflow-wrap: anywhere;
  }
  .close {
    display: none;
  }

  /* Narrow screens: the navigator is a sheet over the page. */
  @media (max-width: 899px) {
    .navigator {
      position: fixed;
      inset: var(--toolbar-height) auto var(--status-height) 0;
      z-index: 2;
      width: min(85vw, 320px);
      transform: translateX(-100%);
      visibility: hidden;
      transition:
        transform var(--panel-out),
        visibility 0s linear var(--panel-out);
      box-shadow: var(--page-shadow);
    }
    .navigator.open {
      transform: none;
      visibility: visible;
      transition:
        transform var(--panel-in),
        visibility 0s;
    }
    .close {
      display: inline-block;
    }
  }
</style>
