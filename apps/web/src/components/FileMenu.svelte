<script lang="ts">
  import { t } from "../i18n/index.ts";
  import {
    doc,
    exportPdf,
    newScript,
    openScript,
    printScript,
    save,
    saveAs,
  } from "../lib/document.svelte.ts";
  import type { MenuItem } from "../lib/menu.ts";
  import Menu from "./Menu.svelte";

  const mac = /Mac|iPhone|iPad/.test(navigator.userAgent);
  const mod = mac ? "⌘" : t("shortcut.ctrl");

  const items: MenuItem[] = $derived([
    { label: "file.new", keys: mac ? "⌥⌘N" : `${mod}+Alt+N`, run: newScript },
    { label: "file.open", keys: mac ? "⌘O" : `${mod}+O`, run: openScript },
    { label: "file.save", keys: mac ? "⌘S" : `${mod}+S`, run: save },
    {
      label: "file.saveAs",
      keys: mac ? "⇧⌘S" : `${mod}+Shift+S`,
      run: saveAs,
    },
    {
      label: "file.exportPdf",
      keys: null,
      run: exportPdf,
      disabled: doc.busy !== null,
    },
    {
      label: "file.print",
      keys: mac ? "⌘P" : `${mod}+P`,
      run: printScript,
      disabled: doc.busy !== null,
    },
  ]);
</script>

<Menu label={t("file.menu")} id="file-menu" {items} />
