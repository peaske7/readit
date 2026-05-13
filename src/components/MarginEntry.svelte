<script lang="ts">
import { type TierSpec, TierTypes } from "../lib/clustering";
import { formatRelativeTime } from "../lib/relative-time";
import { cn } from "../lib/utils";
import { type Comment, FontFamilies } from "../schema";
import { settings } from "../stores/settings.svelte";
import { setActiveCommentId, ui } from "../stores/ui.svelte";

interface Props {
  comment: Comment;
  index: number;
  tier: TierSpec;
  clusterSize?: number;
}

let { comment, index, tier, clusterSize = 1 }: Props = $props();

let canGrow = $derived(tier.type === TierTypes.TIER_1 && clusterSize === 1);

let wrapperEl: HTMLDivElement | undefined = $state();
let isOverflowing = $state(false);

$effect(() => {
  const el = wrapperEl;
  if (!el || tier.type !== TierTypes.TIER_1) return;
  const update = () => {
    isOverflowing = el.scrollHeight > el.clientHeight + 1;
  };
  update();
  const observer = new ResizeObserver(update);
  observer.observe(el);
  return () => observer.disconnect();
});

let isActive = $derived(ui.activeCommentId === comment.id);
let fontClass = $derived(
  settings.fontFamily === FontFamilies.SANS_SERIF ? "font-sans" : "font-serif",
);
let timeLabel = $derived(formatRelativeTime(comment.createdAt));
let hasNote = $derived(comment.comment.trim().length > 0);
let displayText = $derived(hasNote ? comment.comment : comment.selectedText);
let unresolved = $derived(comment.anchorConfidence === "unresolved");

function activate(e: MouseEvent | KeyboardEvent) {
  e.stopPropagation();
  setActiveCommentId(comment.id);
}

function onKey(e: KeyboardEvent) {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    activate(e);
  }
}
</script>

<div
  bind:this={wrapperEl}
  role="button"
  tabindex="0"
  class={cn(
    "relative w-full px-3 cursor-pointer overflow-hidden transition-opacity",
    "border-t border-zinc-100 dark:border-zinc-800 first:border-t-0",
    tier.type === TierTypes.TIER_1 && "py-2",
    tier.type === TierTypes.TIER_2 && "py-1.5",
    tier.type === TierTypes.TIER_3 && "py-1",
    tier.type === TierTypes.GROUP && "py-2",
    unresolved && "opacity-60",
    isOverflowing &&
      "[mask-image:linear-gradient(to_bottom,black_calc(100%-14px),transparent)]",
  )}
  style={canGrow
    ? `min-height: ${tier.height}px; max-height: var(--margin-avail-height, ${tier.height}px)`
    : `height: ${tier.height}px`}
  data-comment-id={comment.id}
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

  {#if tier.type === TierTypes.TIER_1}
    <div class="flex items-baseline gap-2 mb-1">
      <span class="text-[10px] font-bold tabular-nums text-zinc-500 dark:text-zinc-400">
        {index + 1}
      </span>
      {#if timeLabel}
        <span class="ml-auto text-[10px] text-zinc-400 dark:text-zinc-500 tabular-nums">
          {timeLabel}
        </span>
      {/if}
    </div>
    <p
      class={cn(
        fontClass,
        "text-[11px] leading-[14px] text-zinc-600 dark:text-zinc-300",
        !hasNote && "italic text-zinc-400 dark:text-zinc-500",
      )}
    >
      {displayText}
    </p>
  {:else if tier.type === TierTypes.TIER_2}
    <div class="flex items-baseline gap-2">
      <span class="text-[10px] font-bold tabular-nums text-zinc-500 dark:text-zinc-400">
        {index + 1}
      </span>
      {#if timeLabel}
        <span class="ml-auto text-[10px] text-zinc-400 dark:text-zinc-500 tabular-nums">
          {timeLabel}
        </span>
      {/if}
    </div>
    <p
      class={cn(
        fontClass,
        "text-[11px] leading-[14px] text-zinc-600 dark:text-zinc-300 truncate",
        !hasNote && "italic text-zinc-400 dark:text-zinc-500",
      )}
    >
      {displayText}
    </p>
  {:else if tier.type === TierTypes.TIER_3}
    <div class="flex items-center gap-1.5 h-full">
      <span class="text-[10px] font-bold tabular-nums text-zinc-500 dark:text-zinc-400">
        {index + 1}
      </span>
      <span aria-hidden="true" class="text-zinc-300 dark:text-zinc-600">·</span>
      <span
        class={cn(
          fontClass,
          "text-[11px] text-zinc-600 dark:text-zinc-300 truncate flex-1",
          !hasNote && "italic text-zinc-400 dark:text-zinc-500",
        )}
      >
        {displayText}
      </span>
    </div>
  {/if}
</div>
