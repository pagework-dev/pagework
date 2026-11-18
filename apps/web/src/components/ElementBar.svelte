<script lang="ts">
  import { setElement } from "../editor/commands.ts";
  import { SHORTCUT_ELEMENTS, type ScriptElement } from "../editor/elements.ts";
  import { t, type MessageKey } from "../i18n/index.ts";
  import { editorView } from "../lib/editor-view.ts";
  import { session } from "../lib/session.svelte.ts";

  // DESIGN.md, Layout: on touch devices, a row of element buttons sits above
  // the on-screen keyboard.
  const coarse = window.matchMedia("(pointer: coarse)");
  let touch = $state(coarse.matches);
  coarse.addEventListener("change", () => (touch = coarse.matches));

  /** Space the on-screen keyboard takes at the bottom of the window. */
  let keyboard = $state(0);
  const viewport = window.visualViewport;
  function measure(): void {
    if (viewport === null) return;
    keyboard = Math.max(
      0,
      window.innerHeight - viewport.height - viewport.offsetTop,
    );
  }
  viewport?.addEventListener("resize", measure);
  viewport?.addEventListener("scroll", measure);

  const SHORT: Record<ScriptElement, MessageKey> = {
    scene_heading: "bar.scene_heading",
    action: "bar.action",
    character: "bar.character",
    parenthetical: "bar.parenthetical",
    dialogue: "bar.dialogue",
    transition: "bar.transition",
    centered: "bar.centered",
    lyrics: "bar.lyrics",
  };

  function choose(element: ScriptElement): void {
    const view = editorView();
    if (view === null) return;
    setElement(element)(view);
    view.focus();
  }
</script>

{#if touch && session.editorFocused && !session.showFountain}
  <div
    class="bar"
    role="toolbar"
    aria-label={t("bar.label")}
    style:bottom="{keyboard}px"
  >
    {#each SHORTCUT_ELEMENTS as element (element)}
      <button
        type="button"
        class="control"
        class:current={session.currentKind === element}
        aria-pressed={session.currentKind === element}
        onpointerdown={(event) => {
          // Keep the keyboard up: the editor must not lose focus.
          event.preventDefault();
        }}
        onclick={() => {
          choose(element);
        }}
      >
        {t(SHORT[element])}
      </button>
    {/each}
  </div>
{/if}

<style>
  .bar {
    position: fixed;
    left: 0;
    right: 0;
    z-index: 5;
    display: flex;
    gap: calc(var(--space) / 2);
    padding: calc(var(--space) / 2);
    overflow-x: auto;
    background: var(--chrome);
    border-top: 1px solid var(--border);
  }
  .control {
    flex: none;
  }
  .current {
    background: var(--selection);
    border-color: var(--action);
  }
</style>
