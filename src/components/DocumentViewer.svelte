<script lang="ts">
import { onDestroy, onMount } from "svelte";
import {
  createHighlighter,
  type Highlighter,
} from "../lib/highlight/highlighter";
import type { HighlightComment } from "../lib/highlight/types";
import { getMermaidInitConfig } from "../lib/mermaid-config";
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
  positions: Positions;
} = $props();

let contentEl: HTMLElement | undefined;
let containerEl: HTMLDivElement | undefined = $state();
let adapter: Highlighter | null = null;

let prevHtml = "";

let mermaidIdCounter = 0;

async function hydrateMermaid(container: HTMLElement, html: string) {
  if (html === prevHtml) return;
  prevHtml = html;

  const codeBlocks = container.querySelectorAll(
    'pre > code.language-mermaid, pre code[class="language-mermaid"]',
  );
  if (codeBlocks.length === 0) return;

  let cancelled = false;

  const mermaid = (await import("mermaid")).default;

  mermaid.initialize(getMermaidInitConfig());

  for (const codeEl of codeBlocks) {
    if (cancelled) break;
    const code = codeEl.textContent ?? "";
    const preEl = codeEl.parentElement;
    if (!preEl || !code.trim()) continue;

    try {
      const id = `mermaid-hydrate-${mermaidIdCounter++}`;
      const { svg } = await mermaid.render(id, code);

      if (!cancelled && preEl.parentNode) {
        const wrapper = document.createElement("div");
        wrapper.className = "mermaid-container";
        // Safe: mermaid SVG output from user's own local files
        wrapper.innerHTML = svg;
        preEl.replaceWith(wrapper);
      }
    } catch (err) {
      console.warn("Mermaid render failed for block:", err);
    }
  }

  return () => {
    cancelled = true;
  };
}

let proseClass = $derived(
  settings.fontFamily === FontFamilies.SANS_SERIF
    ? "prose-sans"
    : "prose-serif",
);

onMount(() => {
  if (!containerEl) return;

  const existingArticle = document.getElementById(
    "document-content",
  ) as HTMLElement | null;
  if (existingArticle) {
    containerEl.appendChild(existingArticle);
    contentEl = existingArticle;
    existingArticle.className = cn("prose", proseClass);
  } else if (!contentEl) {
    const article = document.createElement("article");
    article.className = cn("prose", proseClass);
    article.innerHTML = content;
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

  if (isActive) {
    positions.attach(contentEl!, containerEl, adapter);
    requestAnimationFrame(() => positions.cache());
  }

  // Defer mermaid hydration off the critical path to avoid blocking INP
  const el = contentEl!;
  const html = content;
  if ("requestIdleCallback" in window) {
    requestIdleCallback(() => hydrateMermaid(el, html));
  } else {
    setTimeout(() => hydrateMermaid(el, html), 100);
  }

  const handleTestSelect = (e: Event) => {
    const { text, startOffset, endOffset } = (e as CustomEvent).detail;
    onTextSelect(text, startOffset, endOffset, 0);
  };
  window.addEventListener("test:select-text", handleTestSelect);

  // Signal that the viewer is interactive (used by e2e tests)
  document.documentElement.dataset.readitReady = "true";

  return () => {
    window.removeEventListener("test:select-text", handleTestSelect);
  };
});

onDestroy(() => {
  positions.detach();
  adapter?.dispose();
  adapter = null;
});

let initialHighlightsDone = false;

$effect(() => {
  if (!isActive || !adapter) return;

  const _comments = comments;
  void content;

  // Skip the first run — highlights were applied synchronously in onMount
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
  }

  return () => {
    if (!isActive) {
      positions.detach();
    }
  };
});

$effect(() => {
  const sorted = comments
    .filter((c) => c.anchorConfidence !== AnchorConfidences.UNRESOLVED)
    .sort((a, b) => a.startOffset - b.startOffset);
  positions.setIds(sorted.map((c) => c.id));
});

$effect(() => {
  if (!contentEl) return;

  if (content && contentEl.innerHTML !== content) {
    contentEl.innerHTML = content;
    contentEl.className = cn("prose", proseClass);
    hydrateMermaid(contentEl, content);
  }
});
</script>

<div bind:this={containerEl} class="flex-1 min-w-0">
  <!-- Article is adopted from server-rendered DOM on initial load,
       or created dynamically on tab switch. No {@html} re-render needed. -->
</div>
