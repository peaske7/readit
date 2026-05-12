<script lang="ts">
import { onDestroy, onMount } from "svelte";
import {
  buildClusters,
  type Cluster,
  findBlockAncestor,
  TierTypes,
} from "../lib/clustering";
import {
  createHighlighter,
  type Highlighter,
} from "../lib/highlight/highlighter";
import type { HighlightComment } from "../lib/highlight/types";
import type { ClusterShape, Positions } from "../lib/positions";
import { cn } from "../lib/utils";
import { AnchorConfidences, type Comment, FontFamilies } from "../schema";
import { settings } from "../stores/settings.svelte";
import BodyMarkers from "./BodyMarkers.svelte";
import MermaidEnhancer from "./MermaidEnhancer.svelte";

let {
  content,
  comments,
  isActive,
  onTextSelect,
  onHighlightClick,
  onTaskToggle,
  onClustersChanged,
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
  onHighlightClick?: (commentId: string) => void;
  onTaskToggle?: (index: number, checked: boolean) => Promise<boolean>;
  onClustersChanged?: (
    clusters: Cluster[],
    indexById: Map<string, number>,
  ) => void;
  registerHighlighter: (
    setFocused: (id: string | undefined) => void,
    scrollToComment: (id: string) => void,
  ) => void;
  unregisterHighlighter?: () => void;
  positions: Positions;
} = $props();

let contentEl: HTMLElement | undefined = $state();
let containerEl: HTMLDivElement | undefined = $state();
let adapter: Highlighter | null = null;
let renderedContent = "";
let contentVersion = $state(0);
let sortedIds = $state<string[]>([]);
let indexById = $state(new Map<string, number>());

function rebuildClusters() {
  if (!adapter) return;

  const sorted = comments
    .filter((c) => c.anchorConfidence !== AnchorConfidences.UNRESOLVED)
    .sort((a, b) => a.startOffset - b.startOffset);

  const ids = sorted.map((c) => c.id);
  const index = new Map<string, number>();
  for (let i = 0; i < sorted.length; i++) {
    index.set(sorted[i].id, i);
  }
  sortedIds = ids;
  indexById = index;

  const paragraphOf = (id: string): Element | null => {
    if (!adapter) return null;
    const ranges = adapter.getRanges(id);
    if (ranges.length === 0) return null;
    return findBlockAncestor(ranges[0].startContainer);
  };

  const built = buildClusters(sorted, paragraphOf);

  const shapes: ClusterShape[] = built.map((c) => ({
    id: c.id,
    commentIds: c.comments.map((cm) => cm.id),
    entryHeight: c.tier.height,
    entryCount: c.tier.type === TierTypes.GROUP ? 1 : c.comments.length,
  }));
  positions.setClusters(shapes);
  positions.cache();

  onClustersChanged?.(built, index);
}

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
          wrapper.dataset.mermaidSource = encodeURIComponent(code);
          // eslint-disable-next-line -- trusted mermaid render output
          wrapper.innerHTML = svg;
          preEl.replaceWith(wrapper);
        } catch {}
      }
      contentVersion++;
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
    containerEl.appendChild(existingArticle);
    contentEl = existingArticle;
    existingArticle.className = cn("prose", proseClass);
  } else if (!contentEl) {
    const article = document.createElement("article");
    article.id = "document-content";
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
    requestAnimationFrame(() => rebuildClusters());
  }

  renderedContent = content;
  contentVersion++;

  void hydrateMermaid(contentEl!);

  const handleTestSelect = (e: Event) => {
    const { text, startOffset, endOffset } = (e as CustomEvent).detail;
    onTextSelect(text, startOffset, endOffset, 0);
  };
  window.addEventListener("test:select-text", handleTestSelect);

  const handleTaskClick = async (e: MouseEvent) => {
    const target = e.target as HTMLElement | null;
    const box = target?.closest?.(".task-checkbox") as HTMLElement | null;
    if (!box || !onTaskToggle) return;
    e.preventDefault();
    e.stopPropagation();

    const idxAttr = box.getAttribute("data-task-index");
    if (idxAttr === null) return;
    const idx = Number(idxAttr);
    if (!Number.isFinite(idx)) return;

    const wasChecked = box.getAttribute("data-checked") === "true";
    const nextChecked = !wasChecked;
    const nextStr = nextChecked ? "true" : "false";

    // Optimistic update — the file-watch + SSE round trip will re-render
    // with authoritative state shortly after.
    box.setAttribute("data-checked", nextStr);
    box.setAttribute("aria-checked", nextStr);

    const ok = await onTaskToggle(idx, nextChecked);
    if (!ok) {
      const revert = wasChecked ? "true" : "false";
      box.setAttribute("data-checked", revert);
      box.setAttribute("aria-checked", revert);
    }
  };

  const handleTaskKey = (e: KeyboardEvent) => {
    if (e.key !== " " && e.key !== "Enter") return;
    const target = e.target as HTMLElement | null;
    if (!target?.classList.contains("task-checkbox")) return;
    e.preventDefault();
    target.click();
  };

  contentEl!.addEventListener("click", handleTaskClick);
  contentEl!.addEventListener("keydown", handleTaskKey);

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
    rebuildClusters();
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
  requestAnimationFrame(() => rebuildClusters());
});

$effect(() => {
  if (!contentEl || !containerEl || !adapter) return;

  if (isActive) {
    positions.attach(contentEl, containerEl, adapter);
    rebuildClusters();
    return () => positions.detach();
  }
});

$effect(() => {
  if (!contentEl) return;
  contentEl.className = cn("prose", proseClass);

  if (renderedContent !== content) {
    contentEl.innerHTML = content; // eslint-disable-line -- trusted server content
    renderedContent = content;
    contentVersion++;
    void hydrateMermaid(contentEl);
  }
});
</script>

<div bind:this={containerEl} class="flex-1 min-w-0 relative">
  {#if isActive}
    <BodyMarkers commentIds={sortedIds} {indexById} {positions} />
  {/if}
</div>

<MermaidEnhancer
  root={contentEl}
  {contentVersion}
  notifyContentChanged={() => {
    if (isActive) {
      requestAnimationFrame(() => rebuildClusters());
    }
  }}
/>
