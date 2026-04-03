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

let proseClass = $derived(
  settings.fontFamily === FontFamilies.SANS_SERIF
    ? "prose-sans"
    : "prose-serif",
);

// --- Setup highlighter ---

onMount(() => {
  if (!containerEl) return;

  // Adopt the server-rendered article if it exists, otherwise create one
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
    // Fallback: create article for tab-switch / non-initial load
    // Safe: content is server-rendered HTML from user's own local files
    // Mermaid diagrams are already rendered as SVG by the server
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

  // Apply highlights immediately — DOM is already present
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

  // Lazy mermaid hydration — only loads mermaid if the document has mermaid blocks
  const mermaidBlocks = contentEl!.querySelectorAll("pre code.language-mermaid");
  if (mermaidBlocks.length > 0) {
    requestIdleCallback(async () => {
      try {
        const { default: mermaid } = await import("mermaid");
        const { getMermaidInitConfig } = await import("../lib/mermaid-config");
        mermaid.initialize(getMermaidInitConfig());

        let counter = 0;
        for (const codeEl of mermaidBlocks) {
          const preEl = codeEl.parentElement;
          if (!preEl) continue;
          const code = codeEl.textContent ?? "";
          try {
            const { svg } = await mermaid.render(`mermaid-${counter++}`, code);
            const wrapper = document.createElement("div");
            wrapper.className = "mermaid-container";
            wrapper.innerHTML = svg;
            preEl.replaceWith(wrapper);
          } catch {
            // Leave as code block on render failure
          }
        }
      } catch {
        // mermaid import failed — leave as code blocks
      }
    });
  }

  // Test event support
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
  unregisterHighlighter?.();
});

// --- Re-apply highlights on comment/content changes ---

let initialHighlightsDone = false;

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

// --- Re-attach positions when isActive changes ---

$effect(() => {
  if (!contentEl || !containerEl || !adapter) return;

  if (isActive) {
    positions.attach(contentEl, containerEl, adapter);
    positions.cache();
    return () => positions.detach();
  }
});

// --- Update sorted comment IDs in positions ---

$effect(() => {
  const sorted = comments
    .filter((c) => c.anchorConfidence !== AnchorConfidences.UNRESOLVED)
    .sort((a, b) => a.startOffset - b.startOffset);
  positions.setIds(sorted.map((c) => c.id));
});

// --- Content change (tab switch / live reload) ---

$effect(() => {
  if (!contentEl) return;
  contentEl.className = cn("prose", proseClass);

  if (contentEl.innerHTML !== content) {
    // Safe: content is server-rendered HTML from user's own local files
    contentEl.innerHTML = content; // eslint-disable-line -- trusted server content
  }
});
</script>

<div bind:this={containerEl} class="flex-1 min-w-0">
  <!-- Article is adopted from server-rendered DOM on initial load,
       or created dynamically on tab switch. Mermaid diagrams are
       pre-rendered as SVG by the server — no client-side mermaid needed. -->
</div>
