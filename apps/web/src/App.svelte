<script lang="ts">
  import Editor from "./components/Editor.svelte";
  import SceneNavigator from "./components/SceneNavigator.svelte";
  import StatusBar from "./components/StatusBar.svelte";
  import Toolbar from "./components/Toolbar.svelte";
  import { t } from "./i18n/index.ts";

  document.title = t("app.name");
</script>

<div class="app">
  <Toolbar />
  <div class="main">
    <SceneNavigator />
    <main class="desk">
      <Editor />
    </main>
  </div>
  <StatusBar />
</div>

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
