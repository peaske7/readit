<script lang="ts">
import { cn } from "../lib/utils";
import { type Comment, FontFamilies } from "../schema";
import { t } from "../stores/locale.svelte";
import { settings } from "../stores/settings.svelte";
import { setActiveCommentId, ui } from "../stores/ui.svelte";
import InlineEditor from "./InlineEditor.svelte";
import ActionLink from "./ui/ActionLink.svelte";
import Text from "./ui/Text.svelte";

interface Props {
  comment: Comment;
  onedit: (id: string, text: string) => void;
  ondelete: (id: string) => void;
  oncopy: (comment: Comment) => void;
  onnavigate: (commentId: string) => void;
}

let { comment, onedit, ondelete, oncopy, onnavigate }: Props = $props();

let isEditing = $state(false);
let fontClass = $derived(
  settings.fontFamily === FontFamilies.SANS_SERIF ? "font-sans" : "font-serif",
);
let hasNote = $derived(comment.comment.trim().length > 0);

function dismiss() {
  setActiveCommentId(undefined);
}

function handleWindowKeydown(e: KeyboardEvent) {
  if (ui.activeCommentId && e.key === "Escape") {
    dismiss();
  }
}
</script>

<svelte:window onkeydown={handleWindowKeydown} />

<!-- Backdrop -->
<button
  type="button"
  aria-label={t("comment.cancel")}
  class="fixed inset-0 z-40 lg:hidden bg-transparent border-0 cursor-default"
  onclick={dismiss}
></button>

<!-- Floating panel -->
<div
  class="fixed bottom-16 left-4 right-4 z-50 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-lg p-4 lg:hidden"
>
  <!-- Selected text -->
  <div class={cn(fontClass, "text-sm italic text-zinc-500 dark:text-zinc-400 mb-2 line-clamp-2")}>
    <button
      type="button"
      onclick={() => {
        onnavigate(comment.id);
        dismiss();
      }}
      class="cursor-pointer hover:underline text-left"
    >
      "{comment.selectedText}"
    </button>
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
    <!-- Comment text -->
    {#if hasNote}
      <p class={cn(fontClass, "text-sm text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap mb-3")}>
        {comment.comment}
      </p>
    {:else}
      <Text variant="caption" class="mb-3 italic">
        {t("marginNote.addNote")}
      </Text>
    {/if}

    <!-- Actions -->
    <div class="flex items-center text-xs text-zinc-400 gap-3 pt-2 border-t border-zinc-100 dark:border-zinc-800">
      <ActionLink onclick={() => (isEditing = true)}>
        {hasNote ? t("marginNote.edit") : t("marginNote.addNote")}
      </ActionLink>
      <span aria-hidden="true">&middot;</span>
      <ActionLink variant="destructive" onclick={() => { ondelete(comment.id); dismiss(); }}>
        {t("marginNote.delete")}
      </ActionLink>
      {#if hasNote}
        <span aria-hidden="true">&middot;</span>
        <ActionLink onclick={() => oncopy(comment)}>
          {t("marginNote.copy")}
        </ActionLink>
      {/if}
      <span class="flex-1"></span>
      <ActionLink onclick={dismiss}>
        {t("comment.cancel")}
      </ActionLink>
    </div>
  {/if}
</div>
