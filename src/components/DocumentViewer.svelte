<script lang="ts">
import { onDestroy, onMount } from "svelte";
import {
  createHighlighter,
  type Highlighter,
} from "../lib/highlight/highlighter";
import type { HighlightComment } from "../lib/highlight/types";
import type { Positions } from "../lib/positions";
import { cn } from "../lib/utils";
import { AnchorConfidences, type Comment, FontFamilies } from "../schema";
import { settings } from "../stores/settings.svelte";

let {
  content,
  comments,
  isActive,
  onTextSelect,
  onHighlightHover,
  onHighlightClick,
  registerHighlighter,
  unregisterHighlighter,
  positions,
}: {
  content: string;
  comments: Comment[];
  isActive: boolean;
  onTextSelect: (
    text: string,
    startOffset: number,
    endOffset: number,
    selectionTop: number,
  ) => void;
  onHighlightHover?: (commentId: string | undefined) => void;
  onHighlightClick?: (commentId: string) => void;
  registerHighlighter: (
    setFocused: (id: string | undefined) => void,
    scrollToComment: (id: string) => void,
  ) => void;
  unregisterHighlighter?: () => void;
  positions: Positions;
} = $props();

let contentEl: HTMLElement | undefined;
let containerEl: HTMLDivElement | undefined = $state();
let adapter: Highlighter | null = null;
let renderedContent = "";

let proseClass = $derived(
  settings.fontFamily === FontFamilies.SANS_SERIF
    ? "prose-sans"
    : "prose-serif",
);

let mermaidCounter = 0;

async function hydrateMermaid(root: HTMLElement) {
  const mermaidBlocks = root.querySelectorAll("pre code.language-mermaid");
  if (mermaidBlocks.length === 0) return;

  requestIdleCallback(async () => {
    try {
      const { default: mermaid } = await import("mermaid");
      const { getMermaidInitConfig } = await import("../lib/mermaid-config");
      mermaid.initialize(getMermaidInitConfig());

      for (const codeEl of mermaidBlocks) {
        const preEl = codeEl.parentElement;
        if (!preEl) continue;
        const code = codeEl.textContent ?? "";
        try {
          const { svg } = await mermaid.render(
            `mermaid-${mermaidCounter++}`,
            code,
          );
          const wrapper = document.createElement("div");
          wrapper.className = "mermaid-container";
          wrapper.innerHTML = svg;
          preEl.replaceWith(wrapper);
        } catch {}
      }
      if (isActive) requestAnimationFrame(() => positions.cache());
    } catch {}
  });
}

onMount(() => {
  if (!containerEl) return;

  const existingArticle = document.getElementById(
    "document-content",
  ) as HTMLElement | null;
  if (existingArticle && !existingArticle.dataset.readitAdopted) {
    existingArticle.dataset.readitAdopted = "true";
    existingArticle.removeAttribute("id");
    containerEl.appendChild(existingArticle);
    contentEl = existingArticle;
    existingArticle.className = cn("prose", proseClass);
  } else if (!contentEl) {
    const article = document.createElement("article");
    article.className = cn("prose", proseClass);
    article.innerHTML = content; // eslint-disable-line -- trusted server content
    containerEl.appendChild(article);
    contentEl = article;
  }

  adapter = createHighlighter({
    root: contentEl!,
    container: containerEl,
    onSelect: onTextSelect,
  });

  registerHighlighter(adapter.setFocused, adapter.scrollToComment);

  if (onHighlightHover) {
    adapter.onHighlightHover(onHighlightHover);
  }

  if (onHighlightClick) {
    adapter.onHighlightClick(onHighlightClick);
  }

  if (isActive && comments.length > 0) {
    const hc: HighlightComment[] = comments
      .filter((c) => c.anchorConfidence !== AnchorConfidences.UNRESOLVED)
      .map((c) => ({
        id: c.id,
        selectedText: c.selectedText,
        startOffset: c.startOffset,
        endOffset: c.endOffset,
      }));
    adapter.applyHighlights(hc);
  }

  renderedContent = content;

  void hydrateMermaid(contentEl!);

  const handleTestSelect = (e: Event) => {
    const { text, startOffset, endOffset } = (e as CustomEvent).detail;
    onTextSelect(text, startOffset, endOffset, 0);
  };
  window.addEventListener("test:select-text", handleTestSelect);

  document.documentElement.dataset.readitReady = "true";

  return () => {
    window.removeEventListener("test:select-text", handleTestSelect);
  };
});

onDestroy(() => {
  positions.detach();
  adapter?.dispose();
  adapter = null;
  unregisterHighlighter?.();
});

// Intentionally capture initial value — skip first $effect when already active.
// svelte-ignore state_referenced_locally
let initialHighlightsDone = !isActive;
$effect(() => {
  if (!isActive || !adapter) return;

  const _comments = comments;
  void content;

  if (!initialHighlightsDone) {
    initialHighlightsDone = true;
    return;
  }

  if (_comments.length === 0) {
    adapter.clearHighlights();
    return;
  }

  const hc: HighlightComment[] = _comments
    .filter((c) => c.anchorConfidence !== AnchorConfidences.UNRESOLVED)
    .map((c) => ({
      id: c.id,
      selectedText: c.selectedText,
      startOffset: c.startOffset,
      endOffset: c.endOffset,
    }));
  adapter.applyHighlights(hc);
});

$effect(() => {
  if (!contentEl || !containerEl || !adapter) return;

  if (isActive) {
    positions.attach(contentEl, containerEl, adapter);
    positions.cache();
    return () => positions.detach();
  }
});

$effect(() => {
  const sorted = comments
    .filter((c) => c.anchorConfidence !== AnchorConfidences.UNRESOLVED)
    .sort((a, b) => a.startOffset - b.startOffset);
  positions.setIds(sorted.map((c) => c.id));
});

$effect(() => {
  if (!contentEl) return;
  contentEl.className = cn("prose", proseClass);

  if (renderedContent !== content) {
    contentEl.innerHTML = content; // eslint-disable-line -- trusted server content
    renderedContent = content;
    void hydrateMermaid(contentEl);
  }
});
</script>

<div bind:this={containerEl} class="flex-1 min-w-0">
</div>
