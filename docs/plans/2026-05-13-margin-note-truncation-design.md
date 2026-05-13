# Margin Note Truncation — Design Proposal

**Date:** 2026-05-13
**Status:** Proposal
**Touches:** `src/components/MarginEntry.svelte`

## Problem

The collapsed margin-note preview cuts comment text off abruptly. In the
reference screenshot, the second line of a TIER_1 entry is visibly clipped
mid-glyph by `overflow-hidden`, producing a sliced-letter look that reads as
a layout bug rather than intentional truncation.

The popover (`CommentPopover.svelte`) already renders the full comment with
`whitespace-pre-wrap`, so the preview only needs to *hint* at "there's more",
not act as the primary read surface.

## Current Implementation

`src/components/MarginEntry.svelte` renders three density tiers. The fixed
heights are consumed verbatim by `src/lib/margin-layout.ts` to position
clusters, so they cannot move:

| Tier    | Height | Lines shown | Truncation method                | File:line |
|---------|--------|-------------|----------------------------------|-----------|
| TIER_1  | 50px   | 2 (intended) | `line-clamp-2`                  | `MarginEntry.svelte:78` |
| TIER_2  | 38px   | 1           | `truncate` (single-line ellipsis) | `MarginEntry.svelte:98` |
| TIER_3  | 24px   | 1 (inline)  | `truncate`                       | `MarginEntry.svelte:113` |
| GROUP   | 50px   | 1           | `truncate`                       | `MarginGroupEntry.svelte:67` |

Tier selection lives in `src/lib/clustering.ts:17-27`, density is computed in
`selectTier(count)`.

### Why the cutoff looks broken (not just truncated)

For TIER_1:

```
height        50px
py-2          -16px (8 top + 8 bottom)
header row    -14px (text-[10px] tabular-nums)
mb-1          -4px
─────────────────
text area     ~16px

text needs    28px for two 14px-leading lines
```

The `<p>` *does* render two lines because `line-clamp-2` allows it, but the
parent's `overflow-hidden` (line 43) chops the second line in half. That is
the jagged edge in the screenshot — not an ellipsis, just a hard pixel clip.

So this is two bugs in one:

1. **Visual artifact**: second line is clipped mid-glyph rather than ending
   cleanly.
2. **UX feel**: even with a clean ellipsis, a hard `…` reads as terminal
   rather than inviting expansion.

TIER_2/TIER_3/GROUP are not affected — they already use single-line
`truncate` and end with a clean `…`.

## Options Considered

### A. Drop to a single line with ellipsis (matches TIER_2)

Change TIER_1's `line-clamp-2` to `truncate`. Consistent with the other
tiers, zero risk to layout math, kills the clipping artifact.

- **Cost**: ~1 LOC.
- **Trade-off**: Loses meaningful preview content. For Japanese comments
  averaging 30–60 characters, one line at 11px in an ~280px-wide gutter
  shows roughly the first 20–25 chars — often not enough to identify the
  comment without expanding.

### B. Gradient mask fade on the `<p>`

Apply `mask-image: linear-gradient(to bottom, black 60%, transparent)` to
the text element only (not the card). Visual second line softly fades into
the card background; no hard edge.

- **Cost**: ~3 LOC (one arbitrary Tailwind class, or a tiny style block).
- **Trade-off**: Requires scoping the mask to `<p>` so the card's background
  doesn't fade too. The current dark `bg-zinc-*` card surface means the
  fade can hit the card bg cleanly. Works in all evergreen browsers without
  `-webkit-` prefix.
- **Layout impact**: None — the `overflow-hidden` clip stays in place; the
  mask just softens the bottom edge before the clip.

### C. Fix the height math (allow 2 full lines)

Bump TIER_1's height in `clustering.ts` from 50px → ~62px so two 14px lines
fit cleanly below the 18px header.

- **Cost**: Constant change + ripple through `margin-layout.ts` collision
  math. Sparser layouts (the only place TIER_1 fires) likely absorb it, but
  it changes the visual rhythm of the whole margin column.
- **Trade-off**: Largest blast radius of the three. Also doesn't solve the
  "hard ellipsis feels terminal" problem — just gives more room before the
  cut.

### D. Hybrid: gradient mask + tier-aware

Apply the gradient mask only to TIER_1 (the only multi-line tier). TIER_2,
TIER_3, GROUP keep single-line `truncate` because at one line the fade is
too subtle to read and an ellipsis is clearer.

This is what calm document tools (Notion, Apple Notes, Craft, Arc) converge
on — fade where there's room to fade, ellipsis where there isn't.

## Recommendation

**Option D — gradient mask on TIER_1 only, keep `truncate` ellipsis on the
single-line tiers.**

Reasoning:

- Solves the actual visual bug (mid-glyph clip → soft fade).
- Preserves the density system without touching height constants or
  `margin-layout.ts`.
- Matches the calm, document-like aesthetic readit aims for; the popover
  remains the single source of truth for full text.
- Tier-differentiated treatment reads as intentional rather than a global
  style swap.

### Implementation

Two-part fix:

**Part 1 — slack-aware growth (`margin-layout.ts`, `positions.ts`).** The
layout resolver now computes `availableHeight` per cluster: distance from
the cluster's resolved top to the next cluster's top (or to the comment
input boundary, or infinity for the last cluster). `Positions` writes this
value to each cluster element as a CSS custom property
`--margin-avail-height`. Because the cap equals the slack to the next
cluster's *resolved* position, a growing cluster never pushes its
neighbours — it only consumes empty space that was already there.

**Part 2 — adaptive entry sizing + overflow-driven mask
(`MarginEntry.svelte`).** TIER_1 single-entry clusters (`canGrow`) drop the
fixed height. They use `min-height: 50px; max-height:
var(--margin-avail-height, 50px)` and `height: auto`, so the box sizes to
its content within the slack-bounded range. The wrapper has
`overflow-hidden` as a safety, and a `ResizeObserver` toggles a
`mask-image: linear-gradient(to bottom, black calc(100% - 14px),
transparent)` class only when `scrollHeight > clientHeight`. When the
content fits there's no fade at all; when slack is too tight the bottom
line softly fades into the cluster background.

Other tiers are unchanged. TIER_1 multi-entry clusters (2–3 comments per
paragraph) keep the fixed 50px per entry; the same overflow-triggered mask
applies to them.

```svelte
let canGrow = $derived(
  tier.type === TierTypes.TIER_1 && clusterSize === 1,
);

let wrapperEl: HTMLDivElement | undefined = $state();
let isOverflowing = $state(false);

$effect(() => {
  const el = wrapperEl;
  if (!el || tier.type !== TierTypes.TIER_1) return;
  const update = () => {
    isOverflowing = el.scrollHeight > el.clientHeight + 1;
  };
  update();
  const observer = new ResizeObserver(update);
  observer.observe(el);
  return () => observer.disconnect();
});
```

```svelte
<div
  bind:this={wrapperEl}
  class={cn(
    "relative w-full px-3 cursor-pointer overflow-hidden",
    /* ... */,
    isOverflowing &&
      "[mask-image:linear-gradient(to_bottom,black_calc(100%-14px),transparent)]",
  )}
  style={canGrow
    ? `min-height: ${tier.height}px; max-height: var(--margin-avail-height, ${tier.height}px)`
    : `height: ${tier.height}px`}
>
```

### Why this matches the user's intuition

> "if there aren't other comments around that would force the clamping
> behavior, the entire comment should appear properly."

Exactly so. Slack is computed against the next cluster's resolved top, so
"no neighbours forcing density" → `availableHeight` is the full distance
to the next cluster's anchor (or infinity → CSS `none` → unbounded). The
comment grows. When neighbours *do* press in, slack tightens and the mask
softens the clip.

### Accessibility

Full comment text remains in the DOM (no `aria-hidden`, no truncation at
the data layer), so screen readers read the full content. Keyboard users
already activate the popover via Enter/Space on the entry (line 32–35),
which renders the unclamped text. No new affordance needed.

## Out of Scope

- Changing tier height constants (Option C) — deferred unless a separate
  density-tuning pass is requested.
- Adding an explicit "Show more" button — the popover is the canonical
  expansion path; a button would duplicate it.
- TIER_2/TIER_3/GROUP behavior — no change.

## Open Questions

1. Should the mask start at 50% or 65%? 55% is the safe default; tuning is
   a glance-test once implemented.
2. Worth a tiny chevron/`⋯` glyph at bottom-right of the fade to make the
   "click to expand" affordance more discoverable, or does the fade alone
   carry it? Lean: fade alone. The whole card is already clickable.
