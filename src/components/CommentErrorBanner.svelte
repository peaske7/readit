<script lang="ts">
import { AlertCircle, X } from "lucide-svelte";

interface Props {
  error: string | null;
  ondismiss: () => void;
}

let { error, ondismiss }: Props = $props();
</script>

{#if error}
  <div
    role="alert"
    aria-live="polite"
    class="fixed top-16 left-1/2 -translate-x-1/2 z-40 w-full max-w-3xl px-4 pointer-events-none"
  >
    <div
      class="flex items-start gap-3 px-4 py-2 text-sm bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-900 dark:text-red-200 rounded-lg shadow-md pointer-events-auto"
    >
      <AlertCircle class="size-4 shrink-0 mt-0.5" />
      <p class="flex-1 select-text break-words">{error}</p>
      <button
        type="button"
        onclick={ondismiss}
        aria-label="Dismiss"
        class="shrink-0 rounded p-1 -mr-1 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors"
      >
        <X class="size-4" />
      </button>
    </div>
  </div>
{/if}
