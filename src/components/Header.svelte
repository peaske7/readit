<script lang="ts">
import { onMount } from "svelte";
import type { Comment } from "../schema";
import { t } from "../stores/locale.svelte";
import ActionsMenu from "./ActionsMenu.svelte";
import CommentBadge from "./CommentBadge.svelte";
import Text from "./ui/Text.svelte";

interface Props {
  fileName: string;
  comments: Comment[];
  hasReanchorTarget: boolean;
  oncopyall: () => void;
  onexportjson: () => void;
  onreload: () => void;
  onedit: (id: string, newText: string) => void;
  ondelete: (id: string) => void;
  ondeleteall: () => void;
  onnavigate: (id: string) => void;
  onstartreanchor: (id: string) => void;
}

let {
  fileName,
  comments,
  hasReanchorTarget,
  oncopyall,
  onexportjson,
  onreload,
  onedit,
  ondelete,
  ondeleteall,
  onnavigate,
  onstartreanchor,
}: Props = $props();

let commentCount = $derived(comments.length);

const HIDE_AFTER_PX = 64;
let hidden = $state(false);
let stripHover = $state(false);
let headerHover = $state(false);
let visible = $derived(!hidden || stripHover || headerHover);

let lastScrollY = 0;
let rafId = 0;

function onScroll() {
  if (rafId) return;
  rafId = requestAnimationFrame(() => {
    rafId = 0;
    const y = window.scrollY;
    if (y <= 0) {
      hidden = false;
    } else if (y > lastScrollY + 2 && y > HIDE_AFTER_PX) {
      hidden = true;
    } else if (y < lastScrollY - 2) {
      hidden = false;
    }
    lastScrollY = y;
  });
}

onMount(() => {
  lastScrollY = window.scrollY;
  window.addEventListener("scroll", onScroll, { passive: true });
  return () => {
    window.removeEventListener("scroll", onScroll);
    if (rafId) cancelAnimationFrame(rafId);
  };
});
</script>

<div
  class="fixed top-0 left-0 right-0 h-3 z-[60]"
  aria-hidden="true"
  onmouseenter={() => (stripHover = true)}
  onmouseleave={() => (stripHover = false)}
></div>

<header
  class="sticky top-0 z-50 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-sm border-b border-zinc-100 dark:border-zinc-800 transition-transform duration-200 ease-out"
  style:transform={visible ? "translateY(0)" : "translateY(-100%)"}
  onmouseenter={() => (headerHover = true)}
  onmouseleave={() => (headerHover = false)}
>
  <div class="px-6 py-3 flex items-center justify-between max-w-7xl mx-auto">
    <div class="flex items-center gap-3">
      <Text variant="title" as="h1">
        readit
      </Text>
      <span class="text-zinc-200 dark:text-zinc-700 font-light">&mdash;</span>
      <Text variant="caption" as="span" class="truncate max-w-[200px]">
        {fileName}
      </Text>
    </div>

    <div class="flex items-center gap-3">
      {#if hasReanchorTarget}
        <Text variant="caption" as="span" class="italic">
          {t("header.selectTextToReanchor")}
        </Text>
      {/if}

      <CommentBadge
        {comments}
        {fileName}
        {onedit}
        {ondelete}
        {ondeleteall}
        {onnavigate}
        {onstartreanchor}
      />

      <ActionsMenu
        {commentCount}
        {oncopyall}
        {onexportjson}
        {onreload}
      />
    </div>
  </div>
</header>
