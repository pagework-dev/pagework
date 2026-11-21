<script lang="ts">
  import { t } from "../../i18n/index.ts";
  import { refreshSession } from "../account.svelte.ts";
  import AuthLayout from "./AuthLayout.svelte";
  import WithoutAccount from "./WithoutAccount.svelte";

  let { withoutAccount }: { withoutAccount: () => void } = $props();
  let busy = $state(false);

  async function retry(): Promise<void> {
    busy = true;
    try {
      await refreshSession();
    } finally {
      busy = false;
    }
  }
</script>

<AuthLayout
  title={t("unreachable.title")}
  intro={t(navigator.onLine ? "error.unreachable" : "error.offline")}
>
  <button
    type="button"
    class="control primary"
    disabled={busy}
    onclick={() => void retry()}
  >
    {t("unreachable.retry")}
  </button>
  {#snippet after()}
    <WithoutAccount choose={withoutAccount} />
  {/snippet}
</AuthLayout>
