<script lang="ts">
  import { t } from "../../i18n/index.ts";
  import { signIn } from "../account.svelte.ts";
  import { errorMessage } from "../api.ts";
  import AuthLayout from "./AuthLayout.svelte";
  import WithoutAccount from "./WithoutAccount.svelte";

  let { withoutAccount }: { withoutAccount: () => void } = $props();

  let email = $state("");
  let password = $state("");
  let busy = $state(false);
  let problem: string | null = $state(null);

  async function submit(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    if (busy) return;
    busy = true;
    problem = null;
    try {
      await signIn(email, password);
    } catch (error) {
      problem = errorMessage(error);
      password = "";
    } finally {
      busy = false;
    }
  }
</script>

<AuthLayout title={t("signIn.title")}>
  <form class="form" onsubmit={submit} novalidate>
    <label class="form-field">
      <span>{t("field.email")}</span>
      <input
        class="input"
        type="email"
        autocomplete="username"
        required
        bind:value={email}
      />
    </label>
    <label class="form-field">
      <span>{t("field.password")}</span>
      <input
        class="input"
        type="password"
        autocomplete="current-password"
        required
        bind:value={password}
      />
    </label>
    {#if problem !== null}
      <p class="form-error" role="alert">{problem}</p>
    {/if}
    <button type="submit" class="control primary" disabled={busy}>
      {t(busy ? "signIn.submitting" : "signIn.submit")}
    </button>
  </form>
  {#snippet after()}
    <WithoutAccount choose={withoutAccount} />
  {/snippet}
</AuthLayout>
