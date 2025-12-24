/**
 * Layout constants for margin notes and document viewer.
 *
 * These values control the positioning and spacing of UI elements.
 * Centralized here to ensure consistency across components.
 */

// =============================================================================
// Header
// =============================================================================

/** Height of the sticky header in pixels */
export const HEADER_HEIGHT_PX = 48;

// =============================================================================
// Margin Notes
// =============================================================================

/**
 * Minimum vertical gap between margin notes in pixels.
 * Used by the overlap resolution algorithm to prevent notes from touching.
 */
export const MARGIN_NOTE_MIN_GAP_PX = 100;

/**
 * Height reserved for the comment input area in pixels.
 * When a user selects text, this space is reserved for the input form.
 * Notes are pushed up or down to avoid overlapping with this zone.
 */
export const COMMENT_INPUT_HEIGHT_PX = 160;

// =============================================================================
// Minimap
// =============================================================================

/**
 * Height of the header offset for minimap positioning.
 * The minimap starts below the header.
 */
export const MINIMAP_HEADER_OFFSET_PX = HEADER_HEIGHT_PX;
