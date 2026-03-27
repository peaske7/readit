<script lang="ts">
import { onMount } from "svelte";
import { cn } from "../lib/utils";
import { FontFamilies } from "../schema";
import { t } from "../stores/locale.svelte";
import { settings } from "../stores/settings.svelte";
import Button from "./ui/Button.svelte";
import Text from "./ui/Text.svelte";

interface Props {
  selectedText: string | null;
  onsubmit: (commentText: string) => void;
  oncancel: () => void;
}

let { selectedText, onsubmit, oncancel }: Props = $props();

let commentText = $state("");
let textareaEl: HTMLTextAreaElement | undefined = $state();

let fontClass = $derived(
  settings.fontFamily === FontFamilies.SANS_SERIF ? "font-sans" : "font-serif",
);

onMount(() => {
  if (textareaEl && window.matchMedia("(pointer: fine)").matches) {
    textareaEl.focus();
  }
});

function handleSubmit() {
  onsubmit(commentText.trim());
  commentText = "";
}

function handleKeyDown(e: KeyboardEvent) {
  if (e.key === "Enter" && e.metaKey) {
    e.preventDefault();
    handleSubmit();
  }
  if (e.key === "Escape") {
    oncancel();
  }
}
</script>

{#if selectedText}
  <div
    data-comment-input
    class="border-t border-zinc-200 dark:border-zinc-700 pt-3 pb-2"
  >
    <Text variant="caption" as="div" class="italic mb-2 line-clamp-2">
      "{selectedText}"
    </Text>
    <textarea
      bind:this={textareaEl}
      bind:value={commentText}
      placeholder={t("comment.placeholder")}
      class={cn(
        fontClass,
        "w-full px-2 py-1.5 text-sm border border-zinc-200 dark:border-zinc-700 dark:bg-zinc-800 resize-none focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-500",
      )}
      rows={2}
      onkeydown={handleKeyDown}
    ></textarea>
    <div class="flex justify-end items-center gap-3 mt-2 text-sm">
      <Button variant="ghost" size="sm" onclick={oncancel}>
        {t("comment.cancel")}
      </Button>
      <Button variant="link" size="sm" onclick={handleSubmit} title="Cmd+Enter">
        {commentText.trim() ? t("comment.addNote") : t("comment.highlight")}
      </Button>
    </div>
  </div>
{/if}
