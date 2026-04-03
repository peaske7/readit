<script lang="ts">
import { ChevronLeft, ChevronRight } from "lucide-svelte";
import { onDestroy } from "svelte";
import { cn } from "../lib/utils";
import type { Comment } from "../schema";
import { t } from "../stores/locale.svelte";
import Button from "./ui/Button.svelte";
import Text from "./ui/Text.svelte";

const ANIMATION_DURATION_MS = 200;

interface Props {
  sortedComments: Comment[];
  currentIndex: number;
  onprevious: () => void;
  onnext: () => void;
}

let { sortedComments, currentIndex, onprevious, onnext }: Props = $props();

let isHovered = $state(false);
let animating = $state<"prev" | "next" | null>(null);
let animationTimeout: ReturnType<typeof setTimeout> | undefined;

onDestroy(() => {
  clearTimeout(animationTimeout);
});

function handlePrevious() {
  animating = "prev";
  onprevious();
  clearTimeout(animationTimeout);
  animationTimeout = setTimeout(() => {
    animating = null;
  }, ANIMATION_DURATION_MS);
}

function handleNext() {
  animating = "next";
  onnext();
  clearTimeout(animationTimeout);
  animationTimeout = setTimeout(() => {
    animating = null;
  }, ANIMATION_DURATION_MS);
}

let totalComments = $derived(sortedComments.length);
</script>

{#if totalComments > 1}
  <fieldset
    class="fixed bottom-6 left-1/2 -translate-x-1/2 z-40"
    onmouseenter={() => (isHovered = true)}
    onmouseleave={() => (isHovered = false)}
  >
    <div
      class={cn(
        "inline-flex items-center gap-1 h-9 px-3 rounded-full",
        "bg-white/90 dark:bg-zinc-900/90 backdrop-blur-md shadow-lg border border-zinc-200/60 dark:border-zinc-700/60",
        "transition-opacity duration-150 ease-out",
        isHovered ? "opacity-100" : "opacity-0",
      )}
    >
      <Button
        variant="ghost"
        size="icon"
        class={cn(
          "size-7 rounded-full text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300",
          animating === "prev" &&
            "scale-90 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300",
        )}
        onclick={handlePrevious}
        title={t("commentNav.previous")}
      >
        <ChevronLeft class="w-4 h-4" />
      </Button>

      <Text
        variant="body"
        as="span"
        class={cn(
          "px-3 tabular-nums select-none min-w-[4rem] text-center",
          "transition-transform duration-200 ease-out",
          animating === "prev" && "-translate-x-0.5",
          animating === "next" && "translate-x-0.5",
        )}
      >
        {t("commentNav.of", {
          current: currentIndex + 1,
          total: totalComments,
        })}
      </Text>

      <Button
        variant="ghost"
        size="icon"
        class={cn(
          "size-7 rounded-full text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300",
          animating === "next" &&
            "scale-90 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300",
        )}
        onclick={handleNext}
        title={t("commentNav.next")}
      >
        <ChevronRight class="w-4 h-4" />
      </Button>
    </div>
  </fieldset>
{/if}
