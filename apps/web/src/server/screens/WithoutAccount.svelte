<script lang="ts">
  import { t } from "../../i18n/index.ts";

  let { choose }: { choose: () => void } = $props();
</script>

<div class="choice">
  <button type="button" class="control" onclick={choose}>
    {t("signIn.local")}
  </button>
  <p class="form-hint">{t("signIn.localHint")}</p>
</div>

<style>
  .choice {
    display: flex;
    flex-direction: column;
    gap: var(--space);
  }
  p {
    margin: 0;
  }
</style>
