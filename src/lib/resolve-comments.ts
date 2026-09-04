import { AnchorConfidences, type Comment } from "../schema.js";
import { findAnchorWithFallback } from "./anchor.js";
import { findTextPosition } from "./highlight/resolver.js";
import { extractTextFromHtml } from "./html-text.js";

/**
 * Resolve stored comments against the current source (and rendered HTML when
 * available). Shared by the local server and the share Worker so both produce
 * identical offsets and confidences from the same `.comments.md` content.
 */
export function resolveComments({
  comments,
  source,
  html,
}: {
  comments: Comment[];
  source: string;
  html?: string;
}): Comment[] {
  const domText = html ? extractTextFromHtml(html) : null;

  return comments.map((comment) => {
    const textForMatching = comment.anchorPrefix || comment.selectedText;

    const anchor = findAnchorWithFallback({
      source,
      selectedText: textForMatching,
      lineHint: comment.lineHint || "L1",
    });

    if (!anchor) {
      return { ...comment, anchorConfidence: AnchorConfidences.UNRESOLVED };
    }

    let startOffset = anchor.start;
    let endOffset = anchor.end;

    if (domText) {
      const domPos = findTextPosition(
        domText,
        comment.selectedText,
        anchor.start,
      );
      if (domPos) {
        startOffset = domPos.start;
        endOffset = domPos.end;
      }
    }

    return {
      ...comment,
      startOffset,
      endOffset,
      lineHint: `L${anchor.line}`,
      anchorConfidence: anchor.confidence,
    };
  });
}
