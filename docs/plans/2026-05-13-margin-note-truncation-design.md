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

### Implementation (TIER_1 `<p>`, `MarginEntry.svelte:75–83`)

`line-clamp-2` is replaced with a `max-h-[26px]` plus a bottom-fading mask
scoped to the `<p>`:

```svelte
<p
  class={cn(
    fontClass,
    "text-[11px] leading-[14px] text-zinc-600 dark:text-zinc-300 overflow-hidden",
    "max-h-[26px] [mask-image:linear-gradient(to_bottom,black_50%,transparent_95%)]",
    !hasNote && "italic text-zinc-400 dark:text-zinc-500",
  )}
>
  {displayText}
</p>
```

- `max-h-[26px]` lets the second line render most of the way through; the
  mask handles the bottom edge so a few pixels of clip is invisible.
- Gradient runs from fully opaque at 50% (~13px, mid-line-1) to nearly
  transparent at 95% (~24.7px, near the bottom of line 2). Starting the
  fade at 50% gives a deeper, more obvious gradient than ending at 100%.
- Mask is scoped to the `<p>`; the card background stays solid.
- The card's `overflow-hidden` (line 43) becomes a safety net rather than
  the active cropper.
- Gradient uses `black` for the mask alpha channel — identical in dark
  and light themes.

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
