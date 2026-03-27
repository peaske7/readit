<script lang="ts">
import { Copy, Trash2 } from "lucide-svelte";
import { generatePrompt } from "../lib/export";
import type { Comment } from "../schema";
import { t } from "../stores/locale.svelte";
import CommentListItem from "./CommentListItem.svelte";
import Button from "./ui/Button.svelte";
import Text from "./ui/Text.svelte";

interface Props {
  comments: Comment[];
  fileName: string;
  onclose: () => void;
  onedit: (id: string, newText: string) => void;
  ondelete: (id: string) => void;
  ondeleteall: () => void;
  onnavigate: (id: string) => void;
  onstartreanchor: (id: string) => void;
}

let {
  comments,
  fileName,
  onclose,
  onedit,
  ondelete,
  ondeleteall,
  onnavigate,
  onstartreanchor,
}: Props = $props();

let confirmingDelete = $state(false);

let unresolvedCount = $derived(
  comments.filter((c) => c.anchorConfidence === "unresolved").length,
);
let resolvedCount = $derived(comments.length - unresolvedCount);

let sortedComments = $derived(
  [...comments].sort((a, b) => {
    const aUnresolved = a.anchorConfidence === "unresolved";
    const bUnresolved = b.anchorConfidence === "unresolved";
    if (aUnresolved === bUnresolved) return 0;
    return aUnresolved ? 1 : -1;
  }),
);

function copyAll() {
  const text = generatePrompt(comments, fileName);
  navigator.clipboard.writeText(text);
}
</script>

{#if confirmingDelete}
  <div class="px-3 py-2 border-b border-zinc-100">
    <Text variant="caption" class="mb-1.5">
      {t("commentManager.deleteAllConfirm", { count: comments.length })}
    </Text>
    <div class="flex gap-3">
      <Button
        variant="link"
        size="sm"
        class="text-red-600 hover:text-red-700 h-auto p-0 text-xs"
        onclick={() => {
          ondeleteall();
          onclose();
        }}
      >
        {t("commentManager.delete")}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        class="h-auto p-0 text-xs"
        onclick={() => (confirmingDelete = false)}
      >
        {t("commentManager.cancel")}
      </Button>
    </div>
  </div>
{:else}
  <Text variant="caption" as="div" class="flex items-center justify-between px-3 py-2 border-b border-zinc-100">
    <span>
      {resolvedCount}
      {#if unresolvedCount > 0}
        <span>
          {" "}· {unresolvedCount} {t("commentManager.unresolved")}
        </span>
      {/if}
    </span>
    <span class="flex items-center gap-1">
      <button
        type="button"
        class="p-1 rounded hover:bg-zinc-100 text-zinc-400 hover:text-zinc-600 transition-colors"
        onclick={copyAll}
        title={t("commentManager.copyAllTitle")}
      >
        <Copy size={13} />
      </button>
      <button
        type="button"
        class="p-1 rounded hover:bg-zinc-100 text-zinc-400 hover:text-red-500 transition-colors"
        onclick={() => (confirmingDelete = true)}
        title={t("commentManager.deleteAllTitle")}
      >
        <Trash2 size={13} />
      </button>
    </span>
  </Text>
{/if}

<div class="overflow-y-auto max-h-80">
  {#if sortedComments.length === 0}
    <Text variant="caption" as="div" class="px-3 py-4 text-center">
      {t("commentManager.noComments")}
    </Text>
  {:else}
    {#each sortedComments as comment (comment.id)}
      <CommentListItem
        {comment}
        onaction={onclose}
        {onedit}
        {ondelete}
        {onnavigate}
        {onstartreanchor}
      />
    {/each}
  {/if}
</div>
