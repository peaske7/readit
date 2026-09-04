<script lang="ts">
import { onDestroy, onMount } from "svelte";
import type { Cluster } from "../lib/geometry/clustering";
import { DocumentGeometry } from "../lib/geometry/document-geometry";
import { cn } from "../lib/utils";
import { type Comment, FontFamilies } from "../schema";
import { settings } from "../stores/settings.svelte";
import BodyMarkers from "./BodyMarkers.svelte";
import CodeBlockEnhancer from "./CodeBlockEnhancer.svelte";
import MermaidEnhancer from "./MermaidEnhancer.svelte";
import TableEnhancer from "./TableEnhancer.svelte";

let {
  content,
  comments,
  isActive,
  filePath,
  onTextSelect,
  onHighlightClick,
  onTaskToggle,
  onClustersChanged,
  registerHighlighter,
  unregisterHighlighter,
  geometry,
}: {
  content: string;
  comments: Comment[];
  isActive: boolean;
  filePath: string;
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
  geometry: DocumentGeometry;
} = $props();

let contentEl: HTMLElement | undefined = $state();
let containerEl: HTMLDivElement | undefined = $state();
let attached = $state(false);
let contentVersion = $state(0);
let sortedIds = $state<string[]>([]);
let indexById = $state(new Map<string, number>());
let unsubscribe: (() => void) | undefined;

let proseClass = $derived(
  settings.fontFamily === FontFamilies.SANS_SERIF
    ? "prose-sans"
    : "prose-serif",
);

let mermaidCounter = 0;

/**
 * Safari (every iOS browser) has no `requestIdleCallback`, and background
 * tabs may never report idle, so diagrams get a deadline either way.
 */
function whenIdle(callback: () => void) {
  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(callback, { timeout: 2000 });
    return;
  }
  setTimeout(callback, 0);
}

async function hydrateMermaid(root: HTMLElement) {
  const mermaidBlocks = root.querySelectorAll("pre code.language-mermaid");
  if (mermaidBlocks.length === 0) return;

  whenIdle(async () => {
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
        } catch (err) {
          console.warn("Mermaid diagram left as code:", err);
        }
      }
      contentVersion++;
      geometry.remeasure();
    } catch (err) {
      console.warn("Mermaid failed to load; diagrams left as code:", err);
    }
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

  geometry.attach({
    root: contentEl!,
    container: containerEl,
    html: content,
    onSelect: onTextSelect,
    onHighlightClick,
  });
  attached = true;

  registerHighlighter(
    (id) => geometry.focus(id),
    (id) => geometry.scrollTo(id),
  );

  unsubscribe = geometry.subscribe((snapshot) => {
    sortedIds = snapshot.commentIds;
    indexById = snapshot.indexById;
    onClustersChanged?.(snapshot.clusters, snapshot.indexById);
  });

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

  markReadOnlyCheckboxes(contentEl!);

  document.documentElement.dataset.readitReady = "true";

  return () => {
    window.removeEventListener("test:select-text", handleTestSelect);
  };
});

onDestroy(() => {
  unsubscribe?.();
  unsubscribe = undefined;
  geometry.detach();
  attached = false;
  unregisterHighlighter?.();
});

$effect(() => {
  if (attached) geometry.setActive(isActive);
});

$effect(() => {
  if (attached) geometry.setComments(comments);
});

$effect(() => {
  if (!contentEl || !attached) return;
  contentEl.className = cn("prose", proseClass);

  if (geometry.setDocumentHtml(content)) {
    contentVersion++;
    markReadOnlyCheckboxes(contentEl);
    void hydrateMermaid(contentEl);
  }
});

/** Without a toggle handler, checkboxes are display only. Re-run per render. */
function markReadOnlyCheckboxes(root: HTMLElement) {
  if (onTaskToggle) return;
  for (const box of root.querySelectorAll<HTMLElement>(".task-checkbox")) {
    box.setAttribute("aria-disabled", "true");
    box.removeAttribute("tabindex");
  }
}
</script>

<div bind:this={containerEl} class="flex-1 min-w-0 relative">
  {#if isActive}
    <BodyMarkers commentIds={sortedIds} {indexById} {geometry} />
  {/if}
</div>

<MermaidEnhancer
  root={contentEl}
  {contentVersion}
  notifyContentChanged={() => geometry.remeasure()}
/>

<CodeBlockEnhancer root={contentEl} {contentVersion} />

<TableEnhancer
  root={contentEl}
  {contentVersion}
  {isActive}
  {filePath}
  notifyLayoutChanged={() => geometry.remeasure()}
/>
