<script lang="ts">
  import { Annotation, Transaction, type ChangeSpec } from "@codemirror/state";
  import type { ViewUpdate } from "@codemirror/view";
  import { onDestroy, onMount, tick } from "svelte";
  import Editor from "../../components/Editor.svelte";
  import ElementBar from "../../components/ElementBar.svelte";
  import SceneNavigator from "../../components/SceneNavigator.svelte";
  import StatusBar from "../../components/StatusBar.svelte";
  import { verbatim } from "../../editor/intents.ts";
  import { t } from "../../i18n/index.ts";
  import { editorView, loadText } from "../../lib/editor-view.ts";
  import { session } from "../../lib/session.svelte.ts";
  import { templateById } from "../../lib/templates.ts";
  import type { Role } from "../account.svelte.ts";
  import { ApiFailure, errorMessage } from "../api.ts";
  import Delayed from "../Delayed.svelte";
  import TextDialog from "../dialogs/TextDialog.svelte";
  import { beforeLeaving, go } from "../router.svelte.ts";
  import {
    canWrite,
    getScript,
    scriptState,
    updateScript,
    type ScriptView,
  } from "../scripts.ts";
  import { openSync, type ScriptSync } from "../sync.svelte.ts";
  import EditorToolbar from "./EditorToolbar.svelte";
  import SyncNotice from "./SyncNotice.svelte";

  let { scriptId }: { scriptId: string } = $props();

  /** Changes that came from the server, which must not be sent back. */
  const fromServer = Annotation.define<boolean>();

  let phase: "loading" | "ready" | "missing" | "failed" = $state("loading");
  let problem: string | null = $state(null);
  let script = $state<ScriptView | null>(null);
  let role: Role = $state("reader");
  let sync = $state<ScriptSync | null>(null);
  let renaming = $state(false);
  /** Set after a first attempt to leave with changes not yet saved. */
  let leaveAnyway = $state(false);

  const writer = $derived(canWrite(role));
  const syncState = $derived(sync?.status.state ?? "saved");
  const editable = $derived(
    writer && (syncState === "saved" || syncState === "saving"),
  );
  const title = $derived(
    script === null || script.title === ""
      ? t("document.untitled")
      : script.title,
  );

  $effect(() => {
    document.title = t("app.title", { name: title });
  });

  function applyRemote(changes: ChangeSpec[]): void {
    editorView()?.dispatch({
      changes,
      annotations: [
        fromServer.of(true),
        // Exactly as written elsewhere: no markers added, not undoable here.
        verbatim.of(true),
        Transaction.addToHistory.of(false),
      ],
    });
  }

  function changed(update: ViewUpdate): void {
    if (update.transactions.some((tr) => tr.annotation(fromServer) === true))
      return;
    sync?.localChange(update);
  }

  async function load(): Promise<void> {
    phase = "loading";
    try {
      const [meta, initial] = await Promise.all([
        getScript(scriptId),
        scriptState(scriptId),
      ]);
      script = meta;
      role = meta.role;
      session.templateId = meta.templateId;
      sync = openSync(scriptId, initial, applyRemote);
      phase = "ready";
      await tick();
      loadText(sync.text());
      if (writer) editorView()?.focus();
    } catch (error) {
      if (error instanceof ApiFailure && error.status === 404)
        phase = "missing";
      else {
        problem = errorMessage(error);
        phase = "failed";
      }
    }
  }

  // The template is the script's format: changing it is saved with the script.
  $effect(() => {
    const id = session.templateId;
    if (script === null || !writer || id === script.templateId) return;
    const target = script.id;
    void updateScript(target, { templateId: id }).then(
      (updated) => {
        if (script?.id === target) script = updated;
      },
      (error: unknown) => {
        problem = errorMessage(error);
      },
    );
  });

  // Save straight away when the writer leaves the script for something else.
  let wasFocused = false;
  $effect(() => {
    const focused = session.editorFocused;
    if (wasFocused && !focused) void sync?.flush();
    wasFocused = focused;
  });

  const hidden = (): void => {
    if (document.visibilityState === "hidden")
      void sync?.flush({ keepalive: true });
  };
  const pageHide = (): void => {
    void sync?.flush({ keepalive: true });
  };
  const unload = (event: BeforeUnloadEvent): void => {
    if (sync?.unsaved() === true) event.preventDefault();
  };

  onMount(() => {
    void load();
    document.addEventListener("visibilitychange", hidden);
    window.addEventListener("pagehide", pageHide);
    window.addEventListener("beforeunload", unload);
    beforeLeaving(async () => {
      if (sync === null) return true;
      if (await sync.flush()) return true;
      const s = sync.status.state;
      if (s === "gone" || s === "readOnly" || leaveAnyway) return true;
      leaveAnyway = true;
      return false;
    });
  });

  onDestroy(() => {
    beforeLeaving(null);
    document.removeEventListener("visibilitychange", hidden);
    window.removeEventListener("pagehide", pageHide);
    window.removeEventListener("beforeunload", unload);
    const closing = sync;
    if (closing !== null)
      void closing.flush().finally(() => {
        closing.close();
      });
  });

  const saveLabel = $derived.by(() => {
    switch (syncState) {
      case "saved":
        return { label: t("save.saved"), warning: false };
      case "saving":
        return { label: t("save.saving"), warning: false };
      case "offline":
        return { label: t("save.offline"), warning: true };
      default:
        return { label: t("save.unsaved"), warning: true };
    }
  });
</script>

{#if phase === "loading"}
  <Delayed>
    <div class="desk">
      <div
        class="outline"
        role="status"
        aria-label={t("editor.opening")}
        style:aspect-ratio="{templateById(session.templateId).page.width} / {templateById(
          session.templateId,
        ).page.height}"
      ></div>
    </div>
  </Delayed>
{:else if phase === "missing" || phase === "failed"}
  <div class="message" role="alert">
    <p>
      {phase === "missing"
        ? t("editor.missing")
        : t("editor.openFailed", { reason: problem ?? "" })}
    </p>
    <div class="actions">
      {#if phase === "failed"}
        <button type="button" class="control" onclick={() => void load()}>
          {t("unreachable.retry")}
        </button>
      {/if}
      <button
        type="button"
        class="control primary"
        onclick={() => void go({ screen: "scripts" })}
      >
        {t("editor.backToScripts")}
      </button>
    </div>
  </div>
{:else}
  <div class="app">
    <EditorToolbar
      {title}
      {writer}
      rename={() => (renaming = true)}
      back={() => void go({ screen: "scripts" })}
    />
    {#if sync !== null}
      <SyncNotice
        {sync}
        {writer}
        {leaveAnyway}
        {problem}
        dismissProblem={() => (problem = null)}
      />
    {/if}
    <div class="main">
      <SceneNavigator />
      <main class="desk">
        <Editor onChange={changed} {editable} />
      </main>
    </div>
    <StatusBar save={saveLabel} />
  </div>
  <ElementBar />
{/if}

<TextDialog
  title={t("scripts.renameTitle")}
  label={t("scripts.titleLabel")}
  action={t("dialog.rename")}
  busyAction={t("dialog.renaming")}
  allowEmpty
  initial={script?.title ?? ""}
  open={renaming}
  close={() => (renaming = false)}
  submit={async (value) => {
    if (script === null) return;
    script = await updateScript(script.id, { title: value });
  }}
/>

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
    height: 100%;
    overflow: auto;
    background: var(--desk);
  }
  .outline {
    width: min(612px, calc(100% - 32px));
    margin: calc(var(--space) * 3) auto;
    background: var(--page);
    box-shadow: var(--page-shadow);
  }
  .message {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: calc(var(--space) * 2);
    max-width: 40rem;
    margin: 0 auto;
    padding: calc(var(--space) * 6) calc(var(--space) * 2);
  }
  .message p {
    margin: 0;
    font-size: var(--text-lg);
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space);
  }
</style>
