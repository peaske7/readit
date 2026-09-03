/**
 * Geometry constants shared by the layout math and the components that render
 * it. Every one of these is applied from TypeScript (inline style or CSS
 * custom property) so a Tailwind class can never drift from the number the
 * resolver used. Tier heights live with the tiers in `clustering.ts`.
 */

/** Vertical padding of the margin column (`data-margin-column`). */
export const MARGIN_COLUMN_PADDING_PX = 24;

/**
 * Slack kept below the lowest cluster. Absolutely-positioned clusters don't
 * contribute to their parent's height, so the column is grown by hand and the
 * last cluster shouldn't sit flush against the footer.
 */
export const COLUMN_BOTTOM_PADDING_PX = MARGIN_COLUMN_PADDING_PX * 2;

/** Vertical gap between two stacked clusters. */
export const CLUSTER_GAP_PX = 16;

/** Padding a cluster block adds around its entries. */
export const ENTRY_PADDING_PX = 12;

/** Space the comment input occupies; applied as its min-height. */
export const COMMENT_INPUT_HEIGHT_PX = 160;
