<script lang="ts">
  import { onMount } from "svelte";
  import Menu from "../../components/Menu.svelte";
  import { t } from "../../i18n/index.ts";
  import type { MenuItem } from "../../lib/menu.ts";
  import { defaultTemplateId, templateById } from "../../lib/templates.ts";
  import type { Role } from "../account.svelte.ts";
  import { errorMessage } from "../api.ts";
  import Delayed from "../Delayed.svelte";
  import ConfirmDialog from "../dialogs/ConfirmDialog.svelte";
  import Dialog from "../dialogs/Dialog.svelte";
  import TextDialog from "../dialogs/TextDialog.svelte";
  import { go, listView } from "../router.svelte.ts";
  import {
    canWrite,
    createProject,
    createScript,
    deleteProject,
    deleteScript,
    listProjects,
    listScripts,
    renameProject,
    updateScript,
    type ProjectView,
    type ScriptView,
  } from "../scripts.ts";

  /** DESIGN.md: the anchor is the list of scripts, sorted by last edited. */
  let scripts: ScriptView[] = $state([]);
  let projects: ProjectView[] = $state([]);
  let role: Role = $state("reader");
  let phase: "loading" | "ready" | "failed" = $state("loading");
  let problem: string | null = $state(null);
  let creating = $state(false);

  /** The dialog that is open, and the script or project it is about. */
  type Open =
    | { kind: "newProject" }
    | { kind: "renameProject"; project: ProjectView }
    | { kind: "deleteProject"; project: ProjectView }
    | { kind: "renameScript"; script: ScriptView }
    | { kind: "moveScript"; script: ScriptView }
    | { kind: "deleteScript"; script: ScriptView }
    | null;
  let open: Open = $state(null);
  let moveTo = $state("");

  const writer = $derived(canWrite(role));
  const project = $derived(
    projects.find((p) => p.id === listView.filter) ?? null,
  );
  const shown = $derived(
    listView.filter === "all"
      ? scripts
      : scripts.filter((s) =>
          listView.filter === "none"
            ? s.projectId === null
            : s.projectId === listView.filter,
        ),
  );

  const when = new Intl.DateTimeFormat("en-AU", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  function projectName(id: string | null): string | null {
    return projects.find((p) => p.id === id)?.name ?? null;
  }

  function titleOf(script: ScriptView): string {
    return script.title === "" ? t("document.untitled") : script.title;
  }

  async function load(): Promise<void> {
    phase = "loading";
    try {
      const [list, groups] = await Promise.all([listScripts(), listProjects()]);
      scripts = list.scripts;
      role = list.role;
      projects = groups.projects;
      if (
        listView.filter !== "all" &&
        listView.filter !== "none" &&
        project === null
      )
        listView.filter = "all";
      phase = "ready";
    } catch (error) {
      problem = errorMessage(error);
      phase = "failed";
    }
  }

  onMount(() => {
    document.title = t("app.title", { name: t("scripts.title") });
    void load();
  });

  async function newScript(): Promise<void> {
    if (creating) return;
    creating = true;
    problem = null;
    try {
      const script = await createScript({
        templateId: defaultTemplateId(navigator.language),
        projectId: project?.id ?? null,
      });
      await go({ screen: "script", id: script.id });
    } catch (error) {
      problem = errorMessage(error);
    } finally {
      creating = false;
    }
  }

  function open_(script: ScriptView, event: MouseEvent): void {
    // Let the browser open a new tab or window as usual.
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0)
      return;
    event.preventDefault();
    void go({ screen: "script", id: script.id });
  }

  function scriptItems(script: ScriptView): MenuItem[] {
    return [
      {
        label: "scripts.rename",
        keys: null,
        run: () => (open = { kind: "renameScript", script }),
      },
      {
        label: "scripts.move",
        keys: null,
        run: () => {
          moveTo = script.projectId ?? "";
          open = { kind: "moveScript", script };
        },
      },
      {
        label: "scripts.delete",
        keys: null,
        run: () => (open = { kind: "deleteScript", script }),
      },
    ];
  }

  const projectItems: MenuItem[] = $derived(
    project === null
      ? []
      : [
          {
            label: "projects.rename",
            keys: null,
            run: () => (open = { kind: "renameProject", project }),
          },
          {
            label: "projects.deleteMenu",
            keys: null,
            run: () => (open = { kind: "deleteProject", project }),
          },
        ],
  );

  function replace(updated: ScriptView): void {
    scripts = scripts.map((s) => (s.id === updated.id ? updated : s));
  }

  const close = (): void => {
    open = null;
  };

  let moving = $state(false);
  let moveProblem: string | null = $state(null);
  async function move(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    if (open?.kind !== "moveScript" || moving) return;
    moving = true;
    moveProblem = null;
    try {
      replace(
        await updateScript(open.script.id, {
          projectId: moveTo === "" ? null : moveTo,
        }),
      );
      close();
    } catch (error) {
      moveProblem = errorMessage(error);
    } finally {
      moving = false;
    }
  }
</script>

<div class="page">
  <div class="heading">
    <h1>{t("scripts.title")}</h1>
    {#if writer && phase === "ready"}
      <button
        type="button"
        class="control primary"
        disabled={creating}
        onclick={() => void newScript()}
      >
        {t(creating ? "scripts.creating" : "file.new")}
      </button>
    {/if}
  </div>

  {#if phase === "loading"}
    <Delayed>
      <p class="muted" role="status">{t("scripts.loading")}</p>
    </Delayed>
  {:else if phase === "failed"}
    <div class="problem" role="alert">
      <p>{t("scripts.loadFailed", { reason: problem ?? "" })}</p>
      <button type="button" class="control" onclick={() => void load()}>
        {t("unreachable.retry")}
      </button>
    </div>
  {:else}
    <div class="filters">
      <label class="filter">
        <span>{t("projects.label")}</span>
        <select class="control" bind:value={listView.filter}>
          <option value="all">{t("projects.all")}</option>
          <option value="none">{t("projects.none")}</option>
          {#each projects as p (p.id)}
            <option value={p.id}>{p.name}</option>
          {/each}
        </select>
      </label>
      {#if writer && project !== null}
        <Menu
          label={t("projects.menu")}
          id="project-menu"
          items={projectItems}
        />
      {/if}
      {#if writer}
        <button
          type="button"
          class="control quiet"
          onclick={() => (open = { kind: "newProject" })}
        >
          {t("projects.new")}
        </button>
      {/if}
    </div>

    {#if problem !== null}
      <p class="form-error" role="alert">{problem}</p>
    {/if}

    {#if shown.length === 0}
      <div class="empty">
        <p>
          {t(scripts.length === 0 ? "scripts.empty" : "scripts.emptyProject")}
        </p>
        {#if writer}
          <button
            type="button"
            class="control primary"
            disabled={creating}
            onclick={() => void newScript()}
          >
            {t("file.new")}
          </button>
        {/if}
      </div>
    {:else}
      <ul class="list" aria-label={t("scripts.title")}>
        {#each shown as script (script.id)}
          <li>
            <a
              class="open"
              href={`/scripts/${script.id}`}
              onclick={(event) => {
                open_(script, event);
              }}
            >
              <span class="title" class:untitled={script.title === ""}>
                {titleOf(script)}
              </span>
              <span class="meta">
                {#if projectName(script.projectId) !== null}
                  <span>{projectName(script.projectId)}</span>
                {/if}
                <span>{templateById(script.templateId).name}</span>
                <span
                  >{t("scripts.edited", {
                    time: when.format(new Date(script.updatedAt)),
                  })}</span
                >
              </span>
            </a>
            {#if writer}
              <Menu
                label={t("scripts.actions", { title: titleOf(script) })}
                text={t("menu.more")}
                id={`script-${script.id}`}
                items={scriptItems(script)}
              />
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  {/if}
</div>

<TextDialog
  title={t("projects.newTitle")}
  label={t("projects.name")}
  action={t("projects.create")}
  busyAction={t("projects.creating")}
  open={open?.kind === "newProject"}
  {close}
  submit={async (name) => {
    const created = await createProject(name);
    projects = [...projects, created].sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    listView.filter = created.id;
  }}
/>

<TextDialog
  title={t("projects.renameTitle")}
  label={t("projects.name")}
  action={t("dialog.rename")}
  busyAction={t("dialog.renaming")}
  initial={open?.kind === "renameProject" ? open.project.name : ""}
  open={open?.kind === "renameProject"}
  {close}
  submit={async (name) => {
    if (open?.kind !== "renameProject") return;
    const renamed = await renameProject(open.project.id, name);
    projects = projects
      .map((p) => (p.id === renamed.id ? renamed : p))
      .sort((a, b) => a.name.localeCompare(b.name));
  }}
/>

<ConfirmDialog
  title={t("projects.deleteTitle", {
    name: open?.kind === "deleteProject" ? open.project.name : "",
  })}
  message={t("projects.deleteMessage")}
  action={t("projects.delete")}
  busyAction={t("dialog.deleting")}
  open={open?.kind === "deleteProject"}
  {close}
  confirm={async () => {
    if (open?.kind !== "deleteProject") return;
    const gone = open.project.id;
    await deleteProject(gone);
    projects = projects.filter((p) => p.id !== gone);
    scripts = scripts.map((s) =>
      s.projectId === gone ? { ...s, projectId: null } : s,
    );
    listView.filter = "all";
  }}
/>

<TextDialog
  title={t("scripts.renameTitle")}
  label={t("scripts.titleLabel")}
  action={t("dialog.rename")}
  busyAction={t("dialog.renaming")}
  allowEmpty
  initial={open?.kind === "renameScript" ? open.script.title : ""}
  open={open?.kind === "renameScript"}
  {close}
  submit={async (title) => {
    if (open?.kind !== "renameScript") return;
    replace(await updateScript(open.script.id, { title }));
  }}
/>

<Dialog
  title={t("scripts.moveTitle", {
    title: open?.kind === "moveScript" ? titleOf(open.script) : "",
  })}
  open={open?.kind === "moveScript"}
  cancel={close}
>
  <form class="form" id="move-form" onsubmit={move}>
    <label class="form-field">
      <span>{t("projects.label")}</span>
      <select class="control" bind:value={moveTo}>
        <option value="">{t("projects.none")}</option>
        {#each projects as p (p.id)}
          <option value={p.id}>{p.name}</option>
        {/each}
      </select>
    </label>
    {#if moveProblem !== null}
      <p class="form-error" role="alert">{moveProblem}</p>
    {/if}
  </form>
  {#snippet actions()}
    <button type="button" class="control" onclick={close}>
      {t("question.cancel")}
    </button>
    <button
      type="submit"
      form="move-form"
      class="control primary"
      disabled={moving}
    >
      {t(moving ? "scripts.moving" : "scripts.moveAction")}
    </button>
  {/snippet}
</Dialog>

<ConfirmDialog
  title={t("scripts.deleteTitle", {
    title: open?.kind === "deleteScript" ? titleOf(open.script) : "",
  })}
  message={t("scripts.deleteMessage")}
  action={t("scripts.deleteAction")}
  busyAction={t("dialog.deleting")}
  open={open?.kind === "deleteScript"}
  {close}
  confirm={async () => {
    if (open?.kind !== "deleteScript") return;
    const gone = open.script.id;
    await deleteScript(gone);
    scripts = scripts.filter((s) => s.id !== gone);
  }}
/>

<style>
  .page {
    width: 100%;
    max-width: 56rem;
    margin: 0 auto;
    padding: calc(var(--space) * 3) calc(var(--space) * 2);
  }
  .heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space);
    margin-bottom: calc(var(--space) * 2);
  }
  h1 {
    margin: 0;
    font-size: var(--text-xl);
    line-height: 1.3;
    font-weight: 600;
  }
  .filters {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space);
    margin-bottom: calc(var(--space) * 2);
  }
  .filter {
    display: flex;
    align-items: center;
    gap: var(--space);
    min-width: 0;
  }
  .filter select {
    max-width: 16rem;
  }
  .filter span {
    color: var(--text-muted);
  }
  .muted {
    color: var(--text-muted);
  }
  .problem,
  .empty {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: calc(var(--space) * 2);
    padding: calc(var(--space) * 4) 0;
  }
  .problem p,
  .empty p {
    margin: 0;
  }
  .problem p {
    color: var(--state-error);
  }
  .empty p {
    font-size: var(--text-lg);
  }
  .list {
    margin: 0;
    padding: 0;
    list-style: none;
    border-top: 1px solid var(--border);
  }
  li {
    display: flex;
    align-items: center;
    gap: var(--space);
    border-bottom: 1px solid var(--border);
  }
  .open {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    padding: calc(var(--space) * 1.5) var(--space);
    color: var(--text);
    text-decoration: none;
    transition: background-color var(--hover);
  }
  .open:hover {
    background: var(--selection);
  }
  .title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 600;
  }
  .title.untitled {
    color: var(--text-muted);
  }
  .meta {
    display: flex;
    flex-wrap: wrap;
    column-gap: calc(var(--space) * 2);
    color: var(--text-muted);
    font-size: var(--text-sm);
    font-variant-numeric: tabular-nums;
  }
</style>
