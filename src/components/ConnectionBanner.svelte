<script lang="ts">
import { WifiOff } from "lucide-svelte";
import { ConnectionStates, connection } from "../stores/connection.svelte";
import { t } from "../stores/locale.svelte";

let isDisconnected = $derived(
  connection.state === ConnectionStates.DISCONNECTED,
);
</script>

{#if isDisconnected}
  <div
    role="alert"
    aria-live="assertive"
    class="fixed top-12 left-1/2 -translate-x-1/2 z-50 w-full max-w-3xl px-4 pointer-events-none"
  >
    <div
      class="flex items-start gap-3 px-4 py-2 text-sm bg-amber-50 dark:bg-amber-950 border border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200 rounded-lg shadow-lg pointer-events-auto"
    >
      <WifiOff class="size-4 shrink-0 mt-0.5" />
      <div class="flex-1">
        <p class="font-medium">{t("connection.disconnectedTitle")}</p>
        <p class="text-xs opacity-80 mt-0.5">
          {t("connection.disconnectedBody")}
        </p>
      </div>
    </div>
  </div>
{/if}
