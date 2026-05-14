<script lang="ts">
import { onMount } from "svelte";
import { formatRelativeTime } from "../lib/relative-time";
import { cn } from "../lib/utils";
import { type Comment, FontFamilies } from "../schema";
import { t } from "../stores/locale.svelte";
import { settings } from "../stores/settings.svelte";
import { setActiveCommentId } from "../stores/ui.svelte";
import InlineEditor from "./InlineEditor.svelte";
import ActionLink from "./ui/ActionLink.svelte";

interface Props {
  comment: Comment;
  index: number;
  onedit: (id: string, text: string) => void;
  ondelete: (id: string) => void;
  oncopy: (comment: Comment) => void;
}

let { comment, index, onedit, ondelete, oncopy }: Props = $props();

let isEditing = $state(true);
let popoverEl: HTMLElement | undefined = $state();

$effect(() => {
  void comment.id;
  isEditing = true;
});
let style = $state("opacity: 0;");
let mounted = $state(false);

let fontClass = $derived(
  settings.fontFamily === FontFamilies.SANS_SERIF ? "font-sans" : "font-serif",
);
let hasNote = $derived(comment.comment.trim().length > 0);
let timeLabel = $derived(formatRelativeTime(comment.createdAt));

function reposition() {
  const row = document.querySelector(
    `[data-comment-id="${comment.id}"]`,
  ) as HTMLElement | null;
  if (!row || !popoverEl) return;

  const rect = row.getBoundingClientRect();
  const popWidth = popoverEl.offsetWidth || 320;
  const popHeight = popoverEl.offsetHeight || 200;

  let left = rect.left - popWidth - 12;
  if (left < 8) {
    left = rect.right + 12;
  }

  const minTop = 8;
  const maxTop = window.innerHeight - popHeight - 8;
  let top = rect.top + rect.height / 2 - popHeight / 2;
  if (top < minTop) top = minTop;
  if (top > maxTop) top = Math.max(minTop, maxTop);

  style = `left: ${left}px; top: ${top}px; opacity: 1;`;
}

function dismiss() {
  setActiveCommentId(undefined);
}

function onWindowKey(e: KeyboardEvent) {
  if (e.key === "Escape") dismiss();
}

function onDocClick(e: MouseEvent) {
  if (!mounted) return;
  const target = e.target as HTMLElement | null;
  if (!target) return;
  if (popoverEl?.contains(target)) return;
  if (target.closest(`[data-comment-id="${comment.id}"]`)) return;
  dismiss();
}

onMount(() => {
  requestAnimationFrame(() => {
    reposition();
    mounted = true;
  });
  const onResize = () => reposition();
  window.addEventListener("resize", onResize);
  window.addEventListener("scroll", onResize, { passive: true });
  return () => {
    window.removeEventListener("resize", onResize);
    window.removeEventListener("scroll", onResize);
  };
});

$effect(() => {
  void comment.id;
  if (popoverEl) reposition();
});
</script>

<svelte:window onkeydown={onWindowKey} />
<svelte:document onmousedown={onDocClick} />

<div
  bind:this={popoverEl}
  class={cn(
    "fixed z-50 w-80 max-w-[calc(100vw-32px)]",
    "hidden lg:block",
    "bg-white dark:bg-zinc-900",
    "border border-zinc-200 dark:border-zinc-700",
    "rounded-lg shadow-lg",
    "p-4",
    "transition-opacity duration-[80ms]",
  )}
  style={style}
  role="dialog"
  aria-label="Comment details"
>
  <div class="flex items-baseline gap-2 mb-2">
    <span class="text-xs font-bold tabular-nums text-zinc-600 dark:text-zinc-300">
      {index + 1}
    </span>
    {#if timeLabel}
      <span class="ml-auto text-[10px] text-zinc-400 dark:text-zinc-500 tabular-nums">
        {timeLabel}
      </span>
    {/if}
  </div>

  <div class={cn(fontClass, "text-xs italic text-zinc-400 dark:text-zinc-500 mb-2 line-clamp-2")}>
    "{comment.selectedText}"
  </div>

  {#if isEditing}
    <InlineEditor
      initialText={comment.comment}
      onsave={(text) => {
        onedit(comment.id, text);
        dismiss();
      }}
      oncancel={() => (isEditing = false)}
    />
  {:else}
    {#if hasNote}
      <p class={cn(fontClass, "text-sm text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap mb-3")}>
        {comment.comment}
      </p>
    {:else}
      <p class={cn(fontClass, "text-xs text-zinc-400 dark:text-zinc-500 italic mb-3")}>
        {t("marginNote.addNote")}
      </p>
    {/if}

    <div class="flex items-center text-xs text-zinc-500 dark:text-zinc-400 gap-1.5 pt-2 border-t border-zinc-100 dark:border-zinc-800">
      <ActionLink onclick={() => (isEditing = true)}>
        {hasNote ? t("marginNote.edit") : t("marginNote.addNote")}
      </ActionLink>
      <span aria-hidden="true">·</span>
      <ActionLink variant="destructive" onclick={() => { ondelete(comment.id); dismiss(); }}>
        {t("marginNote.delete")}
      </ActionLink>
      {#if hasNote}
        <span aria-hidden="true">·</span>
        <ActionLink onclick={() => oncopy(comment)}>
          {t("marginNote.copy")}
        </ActionLink>
      {/if}
    </div>
  {/if}
</div>
