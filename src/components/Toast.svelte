<script lang="ts">
import { Check } from "lucide-svelte";
import { fade } from "svelte/transition";
import { toast } from "../stores/toast.svelte";
</script>

{#if toast.visible}
  <div
    role="status"
    aria-live="polite"
    class="fixed bottom-6 left-1/2 -translate-x-1/2 z-[70] pointer-events-none"
    transition:fade={{ duration: 150 }}
  >
    <div
      class="flex items-center gap-2 px-3.5 py-2 text-sm bg-zinc-900 dark:bg-zinc-100 text-zinc-50 dark:text-zinc-900 rounded-lg shadow-lg pointer-events-auto"
    >
      <Check class="size-4 shrink-0" />
      <span class="select-none">{toast.message}</span>
    </div>
  </div>
{/if}
