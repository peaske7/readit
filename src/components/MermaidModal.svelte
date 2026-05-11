<script lang="ts">
import {
  Code2,
  Image as ImageIcon,
  Maximize,
  RotateCcw,
  ZoomIn,
  ZoomOut,
} from "lucide-svelte";
import { t } from "../stores/locale.svelte";
import Dialog from "./ui/Dialog.svelte";

interface Props {
  open: boolean;
  svg: string;
  source: string;
  onclose: () => void;
}

let { open = $bindable(false), svg, source, onclose }: Props = $props();

type View = "graph" | "code";
let view = $state<View>("graph");

const MIN_SCALE = 0.2;
const MAX_SCALE = 8;
const WHEEL_ZOOM_STEP = 1.0015; // exp factor per wheel-pixel
const BUTTON_ZOOM_STEP = 1.25;

let scale = $state(1);
let tx = $state(0);
let ty = $state(0);

let viewportEl: HTMLDivElement | undefined = $state();
let stageEl: HTMLDivElement | undefined = $state();
let isPanning = $state(false);
let panStartX = 0;
let panStartY = 0;
let panOriginTx = 0;
let panOriginTy = 0;

function clampScale(s: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));
}

function sizeSvgFromViewBox(): { width: number; height: number } | null {
  if (!stageEl) return null;
  const svgEl = stageEl.querySelector<SVGSVGElement>("svg");
  if (!svgEl) return null;

  // Mermaid emits SVGs with only `viewBox` + inline `max-width`. Inside an
  // absolutely-positioned stage with no definite width, that collapses the
  // SVG to 0×0. Pin explicit width/height attributes derived from viewBox
  // so the stage shrink-wraps to a real size.
  const vb = svgEl.viewBox.baseVal;
  let w = vb.width;
  let h = vb.height;
  if (!w || !h) {
    // Fallback: parse the viewBox attribute manually.
    const parts = svgEl.getAttribute("viewBox")?.split(/[\s,]+/) ?? [];
    if (parts.length === 4) {
      w = Number.parseFloat(parts[2]);
      h = Number.parseFloat(parts[3]);
    }
  }
  if (!w || !h) return null;

  svgEl.setAttribute("width", String(w));
  svgEl.setAttribute("height", String(h));
  // Drop mermaid's `max-width: Xpx` so it doesn't fight our explicit width.
  svgEl.style.maxWidth = "none";
  svgEl.style.maxHeight = "none";
  return { width: w, height: h };
}

function fitToViewport() {
  if (!viewportEl || !stageEl) return;
  const dims = sizeSvgFromViewBox();
  if (!dims) return;

  const vpRect = viewportEl.getBoundingClientRect();
  if (vpRect.width === 0 || vpRect.height === 0) return;

  const padding = 24;
  const fitScale = Math.min(
    (vpRect.width - padding * 2) / dims.width,
    (vpRect.height - padding * 2) / dims.height,
    1, // never auto-scale above natural size
  );
  scale = clampScale(fitScale);
  tx = (vpRect.width - dims.width * scale) / 2;
  ty = (vpRect.height - dims.height * scale) / 2;
}

function resetView() {
  scale = 1;
  tx = 0;
  ty = 0;
}

function zoomAt(targetScale: number, viewportX: number, viewportY: number) {
  const next = clampScale(targetScale);
  if (next === scale) return;
  // Keep the world point under (viewportX, viewportY) stationary.
  const worldX = (viewportX - tx) / scale;
  const worldY = (viewportY - ty) / scale;
  tx = viewportX - worldX * next;
  ty = viewportY - worldY * next;
  scale = next;
}

function zoomByButton(factor: number) {
  if (!viewportEl) {
    scale = clampScale(scale * factor);
    return;
  }
  const rect = viewportEl.getBoundingClientRect();
  zoomAt(scale * factor, rect.width / 2, rect.height / 2);
}

function handleWheel(e: WheelEvent) {
  if (!viewportEl) return;
  // Always intercept — mermaid diagrams in modal should be navigated by
  // zoom/pan, not by document scroll.
  e.preventDefault();
  const rect = viewportEl.getBoundingClientRect();
  const cx = e.clientX - rect.left;
  const cy = e.clientY - rect.top;

  // Pinch-zoom on macOS trackpads arrives as ctrlKey + wheel. Two-finger
  // scroll without ctrl should pan instead.
  if (e.ctrlKey || e.metaKey) {
    const factor = WHEEL_ZOOM_STEP ** -e.deltaY;
    zoomAt(scale * factor, cx, cy);
    return;
  }

  // Plain wheel: also zoom (most common on mice without pinch gesture).
  // Hold shift to pan horizontally is a common pattern but a niche; skip.
  const factor = WHEEL_ZOOM_STEP ** -e.deltaY;
  zoomAt(scale * factor, cx, cy);
}

function handlePointerDown(e: PointerEvent) {
  if (e.button !== 0) return;
  if (!viewportEl) return;
  isPanning = true;
  panStartX = e.clientX;
  panStartY = e.clientY;
  panOriginTx = tx;
  panOriginTy = ty;
  viewportEl.setPointerCapture(e.pointerId);
}

function handlePointerMove(e: PointerEvent) {
  if (!isPanning) return;
  tx = panOriginTx + (e.clientX - panStartX);
  ty = panOriginTy + (e.clientY - panStartY);
}

function handlePointerUp(e: PointerEvent) {
  if (!isPanning) return;
  isPanning = false;
  viewportEl?.releasePointerCapture(e.pointerId);
}

function handleKeydown(e: KeyboardEvent) {
  if (!open || view !== "graph") return;
  if (e.key === "+" || e.key === "=") {
    e.preventDefault();
    zoomByButton(BUTTON_ZOOM_STEP);
  } else if (e.key === "-" || e.key === "_") {
    e.preventDefault();
    zoomByButton(1 / BUTTON_ZOOM_STEP);
  } else if (e.key === "0") {
    e.preventDefault();
    resetView();
  } else if (e.key === "f" || e.key === "F") {
    e.preventDefault();
    fitToViewport();
  }
}

// Reset to graph view & default zoom each time the modal opens.
$effect(() => {
  if (open) {
    view = "graph";
    resetView();
    // Wait one frame so the SVG is in the DOM, then fit.
    queueMicrotask(() => {
      requestAnimationFrame(() => fitToViewport());
    });
  }
});

// When switching back to graph view, re-fit (the SVG was hidden so its
// measurements were stale).
$effect(() => {
  if (open && view === "graph") {
    queueMicrotask(() => {
      requestAnimationFrame(() => fitToViewport());
    });
  }
});
</script>

<svelte:window onkeydown={handleKeydown} />

<Dialog
  bind:open
  {onclose}
  contentClass="w-[90vw] h-[90vh] max-w-[90vw]"
>
  {#snippet header()}
    {t("mermaid.modalTitle")}
  {/snippet}

  {#snippet headerActions()}
    <div class="flex items-center gap-1 mr-8">
      {#if view === "graph"}
        <div class="flex items-center gap-0.5 pr-1 mr-1 border-r border-zinc-200 dark:border-zinc-700">
          <button
            type="button"
            onclick={() => zoomByButton(1 / BUTTON_ZOOM_STEP)}
            aria-label={t("mermaid.zoomOut")}
            title={t("mermaid.zoomOut")}
            class="inline-flex items-center justify-center w-7 h-7 rounded-md text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <ZoomOut class="w-3.5 h-3.5" />
          </button>
          <span
            class="inline-flex items-center justify-center min-w-[3.25rem] px-1 text-[11px] tabular-nums text-zinc-600 dark:text-zinc-400 select-none"
            aria-live="polite"
          >
            {Math.round(scale * 100)}%
          </span>
          <button
            type="button"
            onclick={() => zoomByButton(BUTTON_ZOOM_STEP)}
            aria-label={t("mermaid.zoomIn")}
            title={t("mermaid.zoomIn")}
            class="inline-flex items-center justify-center w-7 h-7 rounded-md text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <ZoomIn class="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onclick={fitToViewport}
            aria-label={t("mermaid.zoomFit")}
            title={t("mermaid.zoomFit")}
            class="inline-flex items-center justify-center w-7 h-7 rounded-md text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <Maximize class="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onclick={resetView}
            aria-label={t("mermaid.zoomReset")}
            title={t("mermaid.zoomReset")}
            class="inline-flex items-center justify-center w-7 h-7 rounded-md text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <RotateCcw class="w-3.5 h-3.5" />
          </button>
        </div>
      {/if}
      <button
        type="button"
        onclick={() => (view = "graph")}
        aria-pressed={view === "graph"}
        class="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 aria-pressed:bg-zinc-100 dark:aria-pressed:bg-zinc-800 aria-pressed:text-zinc-900 dark:aria-pressed:text-zinc-100"
      >
        <ImageIcon class="w-3.5 h-3.5" />
        {t("mermaid.viewGraph")}
      </button>
      <button
        type="button"
        onclick={() => (view = "code")}
        aria-pressed={view === "code"}
        class="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 aria-pressed:bg-zinc-100 dark:aria-pressed:bg-zinc-800 aria-pressed:text-zinc-900 dark:aria-pressed:text-zinc-100"
      >
        <Code2 class="w-3.5 h-3.5" />
        {t("mermaid.viewCode")}
      </button>
    </div>
  {/snippet}

  <div class="w-full h-full">
    {#if view === "graph"}
      <div
        bind:this={viewportEl}
        class="mermaid-zoom-viewport"
        class:is-panning={isPanning}
        onwheel={handleWheel}
        onpointerdown={handlePointerDown}
        onpointermove={handlePointerMove}
        onpointerup={handlePointerUp}
        onpointercancel={handlePointerUp}
        role="presentation"
      >
        <div
          bind:this={stageEl}
          class="mermaid-zoom-stage"
          style="transform: translate({tx}px, {ty}px) scale({scale});"
        >
          <!-- eslint-disable-next-line -- trusted mermaid render output -->
          <div class="mermaid-container mermaid-modal-graph">{@html svg}</div>
        </div>
      </div>
    {:else}
      <pre
        class="w-full h-full m-0 p-4 text-xs leading-relaxed font-mono text-zinc-800 dark:text-zinc-200 bg-zinc-50 dark:bg-zinc-950 rounded-lg overflow-auto whitespace-pre"
      >{source}</pre>
    {/if}
  </div>
</Dialog>
