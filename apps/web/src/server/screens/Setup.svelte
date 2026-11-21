<script lang="ts">
  import { t } from "../../i18n/index.ts";
  import { account, setUp } from "../account.svelte.ts";
  import { ApiFailure, errorMessage } from "../api.ts";
  import AuthLayout from "./AuthLayout.svelte";
  import WithoutAccount from "./WithoutAccount.svelte";

  let { withoutAccount }: { withoutAccount: () => void } = $props();

  /** The address printed in the server's log carries the code. */
  function codeFromAddress(): string {
    const url = new URL(location.href);
    const code = url.searchParams.get("setup") ?? "";
    if (code !== "") {
      // Out of the address bar and the history once it's in the form.
      url.searchParams.delete("setup");
      history.replaceState(history.state, "", url);
    }
    return code;
  }

  let code = $state(codeFromAddress());
  let displayName = $state("");
  let email = $state("");
  let password = $state("");
  let orgName = $state("");
  let busy = $state(false);
  let problem: string | null = $state(null);
  const team = $derived(account.instance?.mode !== "personal");

  async function submit(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    if (busy) return;
    busy = true;
    problem = null;
    try {
      await setUp({
        code,
        displayName,
        email,
        password,
        ...(team ? { orgName } : {}),
      });
    } catch (error) {
      if (error instanceof ApiFailure && error.code === "already_set_up")
        account.phase = "signIn";
      problem = errorMessage(error);
    } finally {
      busy = false;
    }
  }
</script>

<AuthLayout title={t("setup.title")} intro={t("setup.intro")}>
  <form class="form" onsubmit={submit} novalidate>
    <label class="form-field">
      <span>{t("setup.code")}</span>
      <input
        class="input"
        autocomplete="off"
        autocapitalize="characters"
        spellcheck="false"
        required
        bind:value={code}
      />
      <span class="form-hint">{t("setup.codeHint")}</span>
    </label>
    <label class="form-field">
      <span>{t("field.yourName")}</span>
      <input
        class="input"
        autocomplete="name"
        required
        bind:value={displayName}
      />
    </label>
    {#if team}
      <label class="form-field">
        <span>{t("setup.orgName")}</span>
        <input
          class="input"
          autocomplete="organization"
          required
          bind:value={orgName}
        />
      </label>
    {/if}
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
        autocomplete="new-password"
        required
        bind:value={password}
      />
      <span class="form-hint">{t("field.passwordHint")}</span>
    </label>
    {#if problem !== null}
      <p class="form-error" role="alert">{problem}</p>
    {/if}
    <button type="submit" class="control primary" disabled={busy}>
      {t(busy ? "setup.submitting" : "setup.submit")}
    </button>
  </form>
  {#snippet after()}
    <WithoutAccount choose={withoutAccount} />
  {/snippet}
</AuthLayout>
