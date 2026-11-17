<script lang="ts">
  import Editor from "./components/Editor.svelte";
  import SceneNavigator from "./components/SceneNavigator.svelte";
  import StatusBar from "./components/StatusBar.svelte";
  import NoticeBar from "./components/NoticeBar.svelte";
  import SaveQuestion from "./components/SaveQuestion.svelte";
  import Toolbar from "./components/Toolbar.svelte";
  import { t } from "./i18n/index.ts";
  import {
    displayName,
    newScript,
    openScript,
    printScript,
    save,
    saveAs,
    startDocument,
  } from "./lib/document.svelte.ts";
  import { fileShortcut } from "./lib/shortcuts.ts";
  import { onMount } from "svelte";

  $effect(() => {
    document.title = t("app.title", { name: displayName() });
  });

  onMount(() => {
    void startDocument();
  });

  const actions = {
    new: newScript,
    open: openScript,
    save,
    saveAs,
    print: printScript,
  };

  function onKey(event: KeyboardEvent): void {
    const action = fileShortcut(event);
    if (action === null) return;
    event.preventDefault();
    void actions[action]();
  }
</script>

<svelte:window onkeydown={onKey} />

<div class="app">
  <Toolbar />
  <NoticeBar />
  <div class="main">
    <SceneNavigator />
    <main class="desk">
      <Editor />
    </main>
  </div>
  <StatusBar />
</div>
<SaveQuestion />

<style>
  .app {
    display: flex;
    flex-direction: column;
    height: 100%;
  }
  .main {
    display: flex;
    flex: 1;
    min-height: 0;
  }
  .desk {
    flex: 1;
    min-width: 0;
    overflow: auto;
    background: var(--desk);
  }
</style>
