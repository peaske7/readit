<script lang="ts">
import type { Heading } from "../lib/headings";
import { cn } from "../lib/utils";
import { FontFamilies } from "../schema";
import { settings } from "../stores/settings.svelte";

interface Props {
  headings: Heading[];
  activeId: string | null;
  onheadingclick: (id: string) => void;
}

let { headings, activeId, onheadingclick }: Props = $props();

let fontClass = $derived(
  settings.fontFamily === FontFamilies.SANS_SERIF ? "font-sans" : "font-serif",
);

let expandedH2s = $state(new Set<string>());

let h2sWithChildren = $derived.by(() => {
  const result = new Set<string>();
  let currentH2: string | null = null;

  for (const heading of headings) {
    if (heading.level === 2) {
      currentH2 = heading.id;
    } else if (heading.level > 2 && currentH2) {
      result.add(currentH2);
    } else if (heading.level === 1) {
      currentH2 = null;
    }
  }
  return result;
});

let visibleHeadings = $derived.by(() => {
  let currentH2: string | null = null;

  return headings.filter((heading) => {
    if (heading.level <= 2) {
      if (heading.level === 2) {
        currentH2 = heading.id;
      } else {
        currentH2 = null;
      }
      return true;
    }

    return currentH2 !== null && expandedH2s.has(currentH2);
  });
});

function toggleH2(id: string) {
  const next = new Set(expandedH2s);
  if (next.has(id)) {
    next.delete(id);
  } else {
    next.add(id);
  }
  expandedH2s = next;
}

let observedActiveId = $state<string | null>(null);

$effect(() => {
  if (headings.length === 0) return;

  const headingElements = headings
    .map((h) => document.getElementById(h.id))
    .filter((el): el is HTMLElement => el !== null);

  if (headingElements.length === 0) return;

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          observedActiveId = entry.target.id;
        }
      }
    },
    {
      rootMargin: "-80px 0px -60% 0px",
      threshold: 0,
    },
  );

  for (const el of headingElements) {
    observer.observe(el);
  }

  return () => observer.disconnect();
});

let effectiveActiveId = $derived(activeId ?? observedActiveId);
</script>

{#if headings.length > 0}
  <nav class={cn("toc", fontClass)} aria-label="Table of contents">
    {#each visibleHeadings as heading (heading.id)}
      {@const hasChildren =
        heading.level === 2 && h2sWithChildren.has(heading.id)}
      {@const isExpanded = expandedH2s.has(heading.id)}
      <a
        href={`#${heading.id}`}
        title={heading.text}
        class={`toc-item toc-level-${heading.level}${effectiveActiveId === heading.id ? " toc-active" : ""}`}
        onclick={(e) => {
          e.preventDefault();
          if (hasChildren) {
            toggleH2(heading.id);
          }
          onheadingclick(heading.id);
        }}
      >
        {heading.text}
        {#if hasChildren}
          <span class="toc-toggle ml-1 opacity-40">
            {isExpanded ? "\u25BE" : "\u25B8"}
          </span>
        {/if}
      </a>
    {/each}
  </nav>
{/if}
