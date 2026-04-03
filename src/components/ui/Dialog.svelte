<script lang="ts">
import { X } from "lucide-svelte";
import type { Snippet } from "svelte";
import { cn } from "../../lib/utils";

interface Props {
  open: boolean;
  onclose?: () => void;
  contentClass?: string;
  children: Snippet;
  header?: Snippet;
  headerActions?: Snippet;
}

let {
  open = $bindable(false),
  onclose,
  contentClass,
  children,
  header,
  headerActions,
}: Props = $props();

let dialogEl: HTMLDialogElement | undefined = $state();

$effect(() => {
  if (!dialogEl) return;

  if (open && !dialogEl.open) {
    dialogEl.showModal();
  } else if (!open && dialogEl.open) {
    dialogEl.close();
  }
});

$effect(() => {
  if (!dialogEl) return;

  const handleClose = () => {
    open = false;
    onclose?.();
  };

  dialogEl.addEventListener("close", handleClose);
  return () => dialogEl!.removeEventListener("close", handleClose);
});

function handleBackdropClick(e: MouseEvent) {
  if (e.target === dialogEl && dialogEl?.open) {
    dialogEl.close();
  }
}

function handleCloseClick() {
  if (dialogEl?.open) dialogEl.close();
}
</script>

<dialog
  bind:this={dialogEl}
  onclick={handleBackdropClick}
  class="backdrop:bg-black/20 dark:backdrop:bg-black/40 backdrop:backdrop-blur-sm bg-transparent p-0 m-auto max-w-none"
>
  {#if open}
    <div
      class={cn(
        "w-full bg-white/95 dark:bg-zinc-900/95 backdrop-blur-sm shadow-lg border border-zinc-200/40 dark:border-zinc-700/40 rounded-xl flex flex-col",
        contentClass,
      )}
    >
      {#if header}
        <div
          class="flex items-center justify-between pl-4 pr-12 py-3 border-b border-zinc-100 dark:border-zinc-800"
        >
          <h2 class="text-sm font-medium text-zinc-900 dark:text-zinc-100">
            {@render header()}
          </h2>
          {#if headerActions}
            {@render headerActions()}
          {/if}
        </div>
      {/if}

      <div class="flex-1 overflow-visible p-4">
        {@render children()}
      </div>

      <button
        type="button"
        onclick={handleCloseClick}
        class="absolute top-3 right-3 size-7 inline-flex items-center justify-center rounded-lg text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
      >
        <X class="w-4 h-4" />
      </button>
    </div>
  {/if}
</dialog>
