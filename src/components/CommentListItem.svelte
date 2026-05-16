<script lang="ts">
import { cn } from "../lib/utils";
import type { Comment } from "../schema";
import { t } from "../stores/locale.svelte";
import InlineEditor from "./InlineEditor.svelte";
import ActionLink from "./ui/ActionLink.svelte";
import Text from "./ui/Text.svelte";

interface Props {
  comment: Comment;
  onaction?: () => void;
  onedit: (id: string, newText: string) => void;
  ondelete: (id: string) => void;
  oncopy: (comment: Comment) => void;
  onnavigate: (id: string) => void;
  onstartreanchor: (id: string) => void;
}

let {
  comment,
  onaction,
  onedit,
  ondelete,
  oncopy,
  onnavigate,
  onstartreanchor,
}: Props = $props();

let isEditing = $state(false);

let isUnresolved = $derived(comment.anchorConfidence === "unresolved");
let canGoTo = $derived(!isUnresolved);

function handleGoTo() {
  onnavigate(comment.id);
  onaction?.();
}

function handleReanchor() {
  onstartreanchor(comment.id);
  onaction?.();
}
</script>

<div
  class={cn(
    "group px-3 py-2 border-b border-zinc-100 dark:border-zinc-800 last:border-b-0",
    isUnresolved && "opacity-50",
  )}
>
  <div class="flex items-center gap-1.5 mb-1">
    <Text variant="caption" as="span" class="italic line-clamp-1">
      "{comment.selectedText}"
    </Text>
    {#if isUnresolved}
      <Text variant="caption" as="span" class="shrink-0">
        · {t("commentList.unresolved")}
      </Text>
    {/if}
  </div>

  {#if isEditing}
    <InlineEditor
      initialText={comment.comment}
      onsave={(text) => {
        onedit(comment.id, text);
        isEditing = false;
      }}
      oncancel={() => (isEditing = false)}
    />
  {:else}
    <Text variant="body" class="line-clamp-2 whitespace-pre-line">
      {comment.comment}
    </Text>

    <div
      class="flex items-center text-xs text-zinc-400 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-within:opacity-100 [@media(pointer:coarse)]:opacity-100 transition-opacity gap-3 mt-1.5"
    >
      <ActionLink onclick={() => (isEditing = true)}>
        {t("commentList.edit")}
      </ActionLink>
      <ActionLink onclick={() => ondelete(comment.id)}>
        {t("commentList.delete")}
      </ActionLink>
      <ActionLink onclick={() => oncopy(comment)}>
        {t("commentList.copy")}
      </ActionLink>
      {#if canGoTo}
        <ActionLink onclick={handleGoTo}>
          {t("commentList.goTo")}
        </ActionLink>
      {/if}
      {#if isUnresolved}
        <ActionLink onclick={handleReanchor}>
          {t("commentList.reanchor")}
        </ActionLink>
      {/if}
    </div>
  {/if}
</div>
