<script lang="ts">
  import { t } from "../../i18n/index.ts";
  import { changePassword } from "../account.svelte.ts";
  import { errorMessage } from "../api.ts";

  let { done = () => {} }: { done?: () => void } = $props();

  let current = $state("");
  let next = $state("");
  let busy = $state(false);
  let problem: string | null = $state(null);
  let changed = $state(false);

  async function submit(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    if (busy) return;
    busy = true;
    problem = null;
    changed = false;
    try {
      await changePassword(current, next);
      current = "";
      next = "";
      changed = true;
      done();
    } catch (error) {
      problem = errorMessage(error);
    } finally {
      busy = false;
    }
  }
</script>

<form class="form" onsubmit={submit} novalidate>
  <label class="form-field">
    <span>{t("password.current")}</span>
    <input
      class="input"
      type="password"
      autocomplete="current-password"
      required
      bind:value={current}
    />
  </label>
  <label class="form-field">
    <span>{t("password.new")}</span>
    <input
      class="input"
      type="password"
      autocomplete="new-password"
      required
      bind:value={next}
    />
    <span class="form-hint">{t("field.passwordHint")}</span>
  </label>
  {#if problem !== null}
    <p class="form-error" role="alert">{problem}</p>
  {/if}
  {#if changed}
    <p class="form-success" role="status">{t("password.changed")}</p>
  {/if}
  <button type="submit" class="control primary" disabled={busy}>
    {t(busy ? "password.submitting" : "password.submit")}
  </button>
</form>
