<script lang="ts">
import { onMount } from "svelte";
import { GeometryAttributes } from "../lib/geometry/attributes";
import type {
  DocumentGeometry,
  MarkerAnchor,
} from "../lib/geometry/document-geometry";
import { setActiveCommentId, ui } from "../stores/ui.svelte";

interface Props {
  commentIds: string[];
  indexById: Map<string, number>;
  geometry: DocumentGeometry;
}

let { commentIds, indexById, geometry }: Props = $props();

let anchors = $state<ReadonlyMap<string, MarkerAnchor>>(new Map());
let unsub: (() => void) | undefined;

function refresh() {
  anchors = geometry.snapshot().markerAnchors;
}

onMount(() => {
  refresh();
  unsub = geometry.subscribe(refresh);
  return () => unsub?.();
});

$effect(() => {
  void commentIds.length;
  refresh();
});

function activate(e: MouseEvent, id: string) {
  e.stopPropagation();
  e.preventDefault();
  setActiveCommentId(id);
}
</script>

<div class="absolute inset-0 pointer-events-none" data-body-markers>
  {#each commentIds as id (id)}
    {@const anchor = anchors.get(id)}
    {@const idx = indexById.get(id) ?? -1}
    {#if anchor && idx >= 0}
      <button
        type="button"
        class="absolute pointer-events-auto cursor-pointer text-[10px] font-bold tabular-nums leading-none px-1 -translate-y-1"
        class:active={ui.activeCommentId === id}
        style="top: {anchor.top}px; left: {anchor.left}px;"
        {...{ [GeometryAttributes.MARKER_FOR]: id }}
        onclick={(e) => activate(e, id)}
      >
        {idx + 1}
      </button>
    {/if}
  {/each}
</div>

<style>
  button {
    color: var(--prose-blockquote, #6b7280);
  }
  button.active {
    color: var(--prose-headings, #111827);
  }
  :global(.dark) button.active {
    color: var(--prose-headings, #f4f4f5);
  }
</style>
