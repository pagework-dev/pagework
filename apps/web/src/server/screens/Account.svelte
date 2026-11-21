<script lang="ts">
  import { t } from "../../i18n/index.ts";
  import { account } from "../account.svelte.ts";
  import PasswordForm from "./PasswordForm.svelte";

  $effect(() => {
    document.title = t("app.title", { name: t("account.title") });
  });
</script>

<div class="page">
  <h1>{t("account.title")}</h1>
  {#if account.view !== null}
    <section aria-labelledby="account-details">
      <h2 id="account-details">{t("account.details")}</h2>
      <dl>
        <dt>{t("field.yourName")}</dt>
        <dd>{account.view.user.displayName}</dd>
        <dt>{t("field.email")}</dt>
        <dd>{account.view.user.email}</dd>
      </dl>
    </section>
    <section aria-labelledby="account-password">
      <h2 id="account-password">{t("password.submit")}</h2>
      <PasswordForm />
    </section>
  {/if}
</div>

<style>
  .page {
    width: 100%;
    max-width: 32rem;
    margin: 0 auto;
    padding: calc(var(--space) * 3) calc(var(--space) * 2);
  }
  h1 {
    margin: 0 0 calc(var(--space) * 3);
    font-size: var(--text-xl);
    line-height: 1.3;
    font-weight: 600;
  }
  h2 {
    margin: 0 0 var(--space);
    font-size: var(--text-lg);
    font-weight: 600;
  }
  section {
    margin-bottom: calc(var(--space) * 4);
  }
  dl {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: var(--space) calc(var(--space) * 2);
    margin: 0;
  }
  dt {
    color: var(--text-muted);
  }
  dd {
    margin: 0;
    overflow-wrap: anywhere;
  }
</style>
