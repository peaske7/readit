<script lang="ts">
import { cn } from "../lib/utils";
import { app, closeDocument, setActiveDocument } from "../stores/app.svelte";
</script>

{#if app.documentOrder.length > 1}
  <div
    class="flex border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 px-2 overflow-x-auto"
    role="tablist"
  >
    {#each app.documentOrder as filePath (filePath)}
      {@const docState = app.documents.get(filePath)}
      {@const isActive = filePath === app.activeDocumentPath}

      {#if docState}
        <div
          role="tab"
          tabindex={isActive ? 0 : -1}
          aria-selected={isActive}
          class={cn(
            "flex items-center gap-1.5 px-3 py-1.5 text-sm border-b-2 whitespace-nowrap cursor-pointer select-none",
            isActive
              ? "border-zinc-900 dark:border-zinc-100 text-zinc-900 dark:text-zinc-100"
              : "border-transparent text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800",
          )}
          onclick={() => setActiveDocument(filePath)}
          onkeydown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setActiveDocument(filePath);
            }
          }}
        >
          <span>{docState.document.fileName}</span>
          <button
            type="button"
            aria-label="Close tab"
            class="ml-1 rounded p-0.5 hover:bg-zinc-200 dark:hover:bg-zinc-700"
            onclick={(e) => {
              e.stopPropagation();
              closeDocument(filePath);
            }}
          >
            <svg class="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
              <path d="M18 6 6 18M6 6l12 12"></path>
            </svg>
          </button>
        </div>
      {/if}
    {/each}
  </div>
{/if}
