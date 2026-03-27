<script lang="ts">
import type { Positions } from "../lib/positions";
import { cn } from "../lib/utils";
import { type Comment, FontFamilies } from "../schema";
import { t } from "../stores/locale.svelte";
import { settings } from "../stores/settings.svelte";
import { setHoveredCommentId, ui } from "../stores/ui.svelte";
import InlineEditor from "./InlineEditor.svelte";
import ActionLink from "./ui/ActionLink.svelte";

interface Props {
  comment: Comment;
  commentIndex?: number;
  positions: Positions;
  onedit: (id: string, text: string) => void;
  ondelete: (id: string) => void;
  oncopy: (comment: Comment) => void;
  onnavigate: (commentId: string) => void;
}

let {
  comment,
  commentIndex = 0,
  positions,
  onedit,
  ondelete,
  oncopy,
  onnavigate,
}: Props = $props();

let isEditing = $state(false);
let articleEl: HTMLElement | undefined = $state();

let isHovered = $derived(ui.hoveredCommentId === comment.id);
let fontClass = $derived(
  settings.fontFamily === FontFamilies.SANS_SERIF ? "font-sans" : "font-serif",
);
let hasNote = $derived(comment.comment.trim().length > 0);
let createdAtFormatted = $derived(
  new Date(comment.createdAt).toLocaleString(),
);

$effect(() => {
  if (articleEl) {
    positions.register(comment.id, articleEl);
  }

  return () => {
    positions.unregister(comment.id);
  };
});

function selectedTextClass(hovered: boolean): string {
  return cn(
    "text-sm italic mb-1 line-clamp-1 flex items-center gap-1 transition-colors duration-150",
    hovered
      ? "text-zinc-600 dark:text-zinc-400"
      : "text-zinc-400 dark:text-zinc-500",
  );
}

function commentTextClass(hovered: boolean): string {
  return cn(
    "text-sm whitespace-pre-wrap transition-colors duration-150",
    hovered
      ? "text-zinc-800 dark:text-zinc-200"
      : "text-zinc-500 dark:text-zinc-400",
  );
}

function badgeClass(hovered: boolean): string {
  return cn(
    "absolute -left-4 top-2 text-xs tabular-nums transition-colors duration-150",
    hovered
      ? "text-zinc-600 dark:text-zinc-400"
      : "text-zinc-400 dark:text-zinc-500",
  );
}
</script>

{#if !hasNote && !isEditing}
  <!-- Highlight-only (no note): minimal em-dash marker -->
  <article
    bind:this={articleEl}
    class="absolute left-0 right-0 group"
    style="visibility: hidden; content-visibility: auto; contain-intrinsic-size: auto 80px;"
    title="Added: {createdAtFormatted}"
    data-comment-id={comment.id}
    onmouseenter={() => setHoveredCommentId(comment.id)}
    onmouseleave={() => setHoveredCommentId(undefined)}
  >
    <span class={badgeClass(isHovered)}>&mdash;</span>

    <div class="pt-2 pb-2 pl-3">
      <div
        class={cn(
          "flex items-center text-xs text-zinc-400 opacity-0 group-hover:opacity-100 transition-opacity",
          "gap-1.5 duration-150",
          isHovered && "opacity-100",
        )}
      >
        <ActionLink onclick={() => (isEditing = true)}>
          {t("marginNote.addNote")}
        </ActionLink>
        <span aria-hidden="true">&middot;</span>
        <ActionLink variant="destructive" onclick={() => ondelete(comment.id)}>
          {t("marginNote.delete")}
        </ActionLink>
      </div>
    </div>
  </article>
{:else}
  <!-- Comment with note -->
  <article
    bind:this={articleEl}
    class="absolute left-0 right-0 group"
    style="visibility: hidden"
    title="Added: {createdAtFormatted}"
    data-comment-id={comment.id}
    onmouseenter={() => setHoveredCommentId(comment.id)}
    onmouseleave={() => setHoveredCommentId(undefined)}
  >
    <span class={badgeClass(isHovered)}>{commentIndex + 1}</span>

    <div
      class={cn(
        "relative border-t border-zinc-100 dark:border-zinc-800 pt-3 pb-2 pl-3 transition-colors duration-150",
        comment.anchorConfidence === "unresolved" && "opacity-60",
      )}
    >
      {#if !isEditing}
        <div class={cn(fontClass, selectedTextClass(isHovered))}>
          <button
            type="button"
            onclick={() => onnavigate(comment.id)}
            class="cursor-pointer hover:underline text-left"
          >
            "{comment.selectedText}"
          </button>
        </div>
      {/if}

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
        <p class={cn(fontClass, commentTextClass(isHovered))}>
          {comment.comment}
        </p>
        <div class="flex items-center text-xs text-zinc-400 opacity-0 group-hover:opacity-100 transition-opacity gap-1.5 mt-2">
          <ActionLink onclick={() => (isEditing = true)}>
            {t("marginNote.edit")}
          </ActionLink>
          <span aria-hidden="true">&middot;</span>
          <ActionLink variant="destructive" onclick={() => ondelete(comment.id)}>
            {t("marginNote.delete")}
          </ActionLink>
          <span aria-hidden="true">&middot;</span>
          <ActionLink onclick={() => oncopy(comment)}>
            {t("marginNote.copy")}
          </ActionLink>
        </div>
      {/if}
    </div>
  </article>
{/if}
