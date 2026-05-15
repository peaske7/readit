<script lang="ts">
import { cn } from "../lib/utils";
import type { Comment } from "../schema";
import { t } from "../stores/locale.svelte";
import CommentManager from "./CommentManager.svelte";
import DropdownMenu from "./ui/DropdownMenu.svelte";

interface Props {
  comments: Comment[];
  fileName: string;
  onedit: (id: string, newText: string) => void;
  ondelete: (id: string) => void;
  ondeleteall: () => void;
  oncopy: (comment: Comment) => void;
  onnavigate: (id: string) => void;
  onstartreanchor: (id: string) => void;
}

let {
  comments,
  fileName,
  onedit,
  ondelete,
  ondeleteall,
  oncopy,
  onnavigate,
  onstartreanchor,
}: Props = $props();

let commentsOpen = $state(false);
let commentCount = $derived(comments.length);
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
      {comments}
      {fileName}
      onclose={() => (commentsOpen = false)}
      {onedit}
      {ondelete}
      {ondeleteall}
      {oncopy}
      {onnavigate}
      {onstartreanchor}
    />
  </DropdownMenu>
{/if}
