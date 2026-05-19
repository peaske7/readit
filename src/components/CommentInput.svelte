<script lang="ts">
import { onMount } from "svelte";
import { clearDraft, loadDraft, saveDraft } from "../lib/comment-drafts";
import { formatBinding } from "../lib/shortcut-registry";
import { cn } from "../lib/utils";
import { FontFamilies } from "../schema";
import { t } from "../stores/locale.svelte";
import { settings } from "../stores/settings.svelte";
import Button from "./ui/Button.svelte";
import Text from "./ui/Text.svelte";

const IS_MAC =
  typeof navigator !== "undefined" && navigator.platform.includes("Mac");
const submitHint = formatBinding(
  IS_MAC ? { key: "Enter", meta: true } : { key: "Enter", ctrl: true },
  IS_MAC,
);
const cancelHint = formatBinding({ key: "Escape" }, IS_MAC);

interface Props {
  selectedText: string | null;
  filePath: string;
  startOffset: number;
  endOffset: number;
  onsubmit: (commentText: string) => Promise<boolean>;
  oncancel: () => void;
}

let {
  selectedText,
  filePath,
  startOffset,
  endOffset,
  onsubmit,
  oncancel,
}: Props = $props();

let commentText = $state("");
let textareaEl: HTMLTextAreaElement | undefined = $state();
let isSubmitting = $state(false);
let submitFailed = $state(false);
let draftRestored = $state(false);
let saveTimer: ReturnType<typeof setTimeout> | undefined;

let fontClass = $derived(
  settings.fontFamily === FontFamilies.SANS_SERIF ? "font-sans" : "font-serif",
);

onMount(() => {
  const existing = loadDraft(filePath, startOffset, endOffset);
  if (existing) {
    commentText = existing;
    draftRestored = true;
  }
  if (textareaEl && window.matchMedia("(pointer: fine)").matches) {
    textareaEl.focus();
    if (existing) {
      textareaEl.setSelectionRange(existing.length, existing.length);
    }
  }
  return () => {
    if (saveTimer) clearTimeout(saveTimer);
  };
});

$effect(() => {
  const text = commentText;
  if (saveTimer) clearTimeout(saveTimer);
  if (!text) {
    clearDraft(filePath, startOffset, endOffset);
    return;
  }
  saveTimer = setTimeout(() => {
    saveDraft(filePath, startOffset, endOffset, text);
  }, 300);
});

async function handleSubmit() {
  if (isSubmitting) return;
  const text = commentText.trim();
  const draftFilePath = filePath;
  const draftStart = startOffset;
  const draftEnd = endOffset;
  submitFailed = false;
  isSubmitting = true;
  try {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = undefined;
    }
    const ok = await onsubmit(text);
    if (ok) {
      clearDraft(draftFilePath, draftStart, draftEnd);
      commentText = "";
    } else if (text) {
      submitFailed = true;
      saveDraft(draftFilePath, draftStart, draftEnd, text);
    }
  } finally {
    isSubmitting = false;
  }
}

function handleKeyDown(e: KeyboardEvent) {
  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    handleSubmit();
  }
  if (e.key === "Escape") {
    oncancel();
  }
}

function dismissDraftNotice() {
  draftRestored = false;
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
    {#if draftRestored}
      <Text
        variant="caption"
        as="div"
        class="mb-1.5 text-amber-700 dark:text-amber-400"
      >
        {t("comment.draftRestored")} ·
        <button
          type="button"
          class="underline hover:no-underline"
          onclick={dismissDraftNotice}
        >
          ×
        </button>
      </Text>
    {/if}
    <textarea
      bind:this={textareaEl}
      bind:value={commentText}
      placeholder={t("comment.placeholder")}
      class={cn(
        fontClass,
        "w-full px-2 py-1.5 text-sm border border-zinc-200 dark:border-zinc-700 dark:bg-zinc-800 resize-none focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-500",
        submitFailed && "border-red-400 dark:border-red-500",
      )}
      rows={2}
      disabled={isSubmitting}
      onkeydown={handleKeyDown}
      oninput={() => {
        if (draftRestored) draftRestored = false;
        if (submitFailed) submitFailed = false;
      }}
    ></textarea>
    {#if submitFailed}
      <Text
        variant="caption"
        as="div"
        class="mt-1 text-red-600 dark:text-red-400"
      >
        {t("comment.submitFailedRetry")}
      </Text>
    {/if}
    <div class="flex justify-end items-center gap-3 mt-2 text-sm">
      <Button
        variant="ghost"
        size="sm"
        disabled={isSubmitting}
        onclick={oncancel}
      >
        {t("comment.cancel")}
        <span class="text-zinc-400 dark:text-zinc-500">{cancelHint}</span>
      </Button>
      <Button
        variant="link"
        size="sm"
        disabled={isSubmitting}
        onclick={handleSubmit}
      >
        {commentText.trim() ? t("comment.addNote") : t("comment.highlight")}
        <span class="text-zinc-400 dark:text-zinc-500">{submitHint}</span>
      </Button>
    </div>
  </div>
{/if}
