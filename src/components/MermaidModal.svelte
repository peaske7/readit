<script lang="ts">
import { Code2, Image as ImageIcon } from "lucide-svelte";
import { t } from "../stores/locale.svelte";
import Dialog from "./ui/Dialog.svelte";

interface Props {
  open: boolean;
  svg: string;
  source: string;
  onclose: () => void;
}

let { open = $bindable(false), svg, source, onclose }: Props = $props();

type View = "graph" | "code";
let view = $state<View>("graph");

// Reset to graph view each time the modal opens so the user always
// lands on the diagram first.
$effect(() => {
  if (open) view = "graph";
});
</script>

<Dialog
  bind:open
  {onclose}
  contentClass="w-[90vw] h-[90vh] max-w-[90vw]"
>
  {#snippet header()}
    {t("mermaid.modalTitle")}
  {/snippet}

  {#snippet headerActions()}
    <div class="flex items-center gap-1 mr-8">
      <button
        type="button"
        onclick={() => (view = "graph")}
        aria-pressed={view === "graph"}
        class="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 aria-pressed:bg-zinc-100 dark:aria-pressed:bg-zinc-800 aria-pressed:text-zinc-900 dark:aria-pressed:text-zinc-100"
      >
        <ImageIcon class="w-3.5 h-3.5" />
        {t("mermaid.viewGraph")}
      </button>
      <button
        type="button"
        onclick={() => (view = "code")}
        aria-pressed={view === "code"}
        class="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 aria-pressed:bg-zinc-100 dark:aria-pressed:bg-zinc-800 aria-pressed:text-zinc-900 dark:aria-pressed:text-zinc-100"
      >
        <Code2 class="w-3.5 h-3.5" />
        {t("mermaid.viewCode")}
      </button>
    </div>
  {/snippet}

  <div class="w-full h-full overflow-auto flex items-center justify-center">
    {#if view === "graph"}
      <!-- eslint-disable-next-line -- trusted mermaid render output -->
      <div class="mermaid-container mermaid-modal-graph">{@html svg}</div>
    {:else}
      <pre
        class="w-full h-full m-0 p-4 text-xs leading-relaxed font-mono text-zinc-800 dark:text-zinc-200 bg-zinc-50 dark:bg-zinc-950 rounded-lg overflow-auto whitespace-pre"
      >{source}</pre>
    {/if}
  </div>
</Dialog>
