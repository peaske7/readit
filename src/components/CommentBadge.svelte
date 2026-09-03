<script lang="ts">
import { cn } from "../lib/utils";
import { app } from "../stores/app.svelte";
import { t } from "../stores/locale.svelte";
import CommentManager from "./CommentManager.svelte";
import DropdownMenu from "./ui/DropdownMenu.svelte";

interface Props {
  filePath: string;
  onnavigate: (id: string) => void;
}

let { filePath, onnavigate }: Props = $props();

let commentsOpen = $state(false);
let commentCount = $derived(app.documents.get(filePath)?.comments.length ?? 0);
</script>

{#if commentCount > 0}
  <DropdownMenu
    bind:open={commentsOpen}
    align="end"
    contentClass="w-80 max-h-96 overflow-hidden p-0"
  >
    {#snippet trigger()}
      <button
        type="button"
        class={cn(
          "inline-flex items-center gap-1 text-xs tabular-nums select-none transition-colors",
          commentsOpen
            ? "text-zinc-600"
            : "text-zinc-400 hover:text-zinc-600",
        )}
        title={commentCount === 1
          ? t("commentBadge.title", { count: commentCount })
          : t("commentBadge.titlePlural", { count: commentCount })}
      >
        <span class="text-zinc-300">·</span>
        {commentCount}
      </button>
    {/snippet}

    <CommentManager
      {filePath}
      onclose={() => (commentsOpen = false)}
      {onnavigate}
    />
  </DropdownMenu>
{/if}
