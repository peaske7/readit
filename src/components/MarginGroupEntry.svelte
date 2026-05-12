<script lang="ts">
import { cn } from "../lib/utils";
import { type Comment, FontFamilies } from "../schema";
import { t } from "../stores/locale.svelte";
import { settings } from "../stores/settings.svelte";
import { setActiveCommentId, ui } from "../stores/ui.svelte";

interface Props {
  comments: Comment[];
  startIndex: number;
}

let { comments, startIndex }: Props = $props();

let fontClass = $derived(
  settings.fontFamily === FontFamilies.SANS_SERIF ? "font-sans" : "font-serif",
);
let count = $derived(comments.length);
let preview = $derived(comments[0]?.comment || comments[0]?.selectedText || "");
let firstId = $derived(comments[0]?.id);
let isActive = $derived(
  firstId !== undefined && comments.some((c) => c.id === ui.activeCommentId),
);

function activate(e: MouseEvent | KeyboardEvent) {
  e.stopPropagation();
  if (firstId) setActiveCommentId(firstId);
}

function onKey(e: KeyboardEvent) {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    activate(e);
  }
}
</script>

<div
  role="button"
  tabindex="0"
  class="relative w-full px-3 py-2 cursor-pointer overflow-hidden border-t border-zinc-100 dark:border-zinc-800 first:border-t-0"
  style="height: 50px"
  data-cluster-group
  data-comment-id={firstId}
  data-active={isActive}
  onclick={activate}
  onkeydown={onKey}
>
  {#if isActive}
    <span
      aria-hidden="true"
      class="absolute left-0 top-0 bottom-0 w-0.5 bg-zinc-900 dark:bg-zinc-100"
    ></span>
  {/if}

  <div class="flex items-baseline gap-2 mb-1">
    <span class="text-[10px] font-bold tabular-nums text-zinc-500 dark:text-zinc-400">
      {startIndex + 1}–{startIndex + count}
    </span>
    <span
      class="ml-auto inline-flex items-center justify-center text-[9px] font-bold text-zinc-600 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 rounded-full px-1.5 min-w-[20px] h-[14px] tabular-nums"
    >
      {count}
    </span>
  </div>

  <p
    class={cn(
      fontClass,
      "text-[11px] leading-[14px] text-zinc-600 dark:text-zinc-300 truncate",
    )}
  >
    {preview}
  </p>

  <p class="text-[9px] text-zinc-400 dark:text-zinc-500 mt-0.5">
    {count} {t("commentBadge.titlePlural").replace("{{count}}", "").trim() || "comments"}
  </p>
</div>
