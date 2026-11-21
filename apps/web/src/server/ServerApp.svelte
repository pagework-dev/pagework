<script lang="ts">
  import { onMount } from "svelte";
  import { t } from "../i18n/index.ts";
  import type { Instance } from "../lib/host.svelte.ts";
  import { account, loadAccount } from "./account.svelte.ts";
  import Delayed from "./Delayed.svelte";
  import Account from "./screens/Account.svelte";
  import NewPassword from "./screens/NewPassword.svelte";
  import Setup from "./screens/Setup.svelte";
  import SignIn from "./screens/SignIn.svelte";
  import Unreachable from "./screens/Unreachable.svelte";
  import Shell from "./Shell.svelte";

  let {
    instance,
    withoutAccount,
  }: { instance: Instance; withoutAccount: () => void } = $props();

  onMount(() => {
    void loadAccount(instance);
  });
</script>

{#if account.phase === "loading"}
  <Delayed>
    <p class="loading" role="status">{t("server.connecting")}</p>
  </Delayed>
{:else if account.phase === "setup"}
  <Setup {withoutAccount} />
{:else if account.phase === "signIn"}
  <SignIn {withoutAccount} />
{:else if account.phase === "newPassword"}
  <NewPassword />
{:else if account.phase === "unreachable"}
  <Unreachable {withoutAccount} />
{:else}
  <Shell>
    <Account />
  </Shell>
{/if}

<style>
  .loading {
    margin: 0;
    padding: calc(var(--space) * 6) calc(var(--space) * 2);
    text-align: center;
    color: var(--text-muted);
  }
</style>
