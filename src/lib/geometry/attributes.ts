/**
 * The data-attribute contract between the geometry module and the components
 * that render it. Writers spread these; readers build selectors from them, so
 * a rename can't leave one side behind.
 */
export const GeometryAttributes = {
  /** A margin entry (or group entry) standing in for one comment. */
  COMMENT_ID: "data-comment-id",
  /** An in-body numbered marker pointing at a comment. */
  MARKER_FOR: "data-marker-for",
  /** A positioned cluster block in the margin column. */
  CLUSTER_ID: "data-cluster-id",
  /** The margin column itself. */
  MARGIN_COLUMN: "data-margin-column",
  /** The comment composer. */
  COMMENT_INPUT: "data-comment-input",
} as const;
