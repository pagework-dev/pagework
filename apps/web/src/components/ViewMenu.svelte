<script lang="ts">
  import { t } from "../i18n/index.ts";
  import { editorView } from "../lib/editor-view.ts";
  import { session } from "../lib/session.svelte.ts";

  /** Changes a view setting and returns the writer to the script. */
  function then(change: () => void): () => void {
    return () => {
      change();
      editorView()?.focus();
    };
  }
  import type { MenuItem } from "../lib/menu.ts";
  import Menu from "./Menu.svelte";

  const items: MenuItem[] = $derived([
    {
      label: "view.page",
      keys: null,
      checked: session.layout === "page",
      radio: true,
      run: then(() => (session.layout = "page")),
    },
    {
      label: "view.reflow",
      keys: null,
      checked: session.layout === "reflow",
      radio: true,
      run: then(() => (session.layout = "reflow")),
    },
    {
      label: "view.showFountain",
      keys: null,
      checked: session.showFountain,
      run: then(() => (session.showFountain = !session.showFountain)),
    },
  ]);
</script>

<Menu label={t("view.menu")} id="view-menu" {items} />
