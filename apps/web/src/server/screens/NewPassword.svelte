<script lang="ts">
  import { t } from "../../i18n/index.ts";
  import { signOut } from "../account.svelte.ts";
  import AuthLayout from "./AuthLayout.svelte";
  import PasswordForm from "./PasswordForm.svelte";
</script>

<AuthLayout title={t("password.requiredTitle")} intro={t("password.required")}>
  <PasswordForm />
  {#snippet after()}
    <button type="button" class="control" onclick={() => void signOut()}>
      {t("account.signOut")}
    </button>
  {/snippet}
</AuthLayout>
