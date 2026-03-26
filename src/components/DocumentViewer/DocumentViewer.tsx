import { useEffect, useRef } from "react";
import { useCommentActions } from "../../contexts/CommentContext";
import { usePositions } from "../../contexts/PositionsContext";
import { useSettings } from "../../contexts/SettingsContext";
import { useMermaidHydration } from "../../hooks/useMermaidHydration";
import {
  createHighlighter,
  type Highlighter,
} from "../../lib/highlight/highlighter";
import type { HighlightComment } from "../../lib/highlight/types";
import { cn } from "../../lib/utils";
import { AnchorConfidences, type Comment, FontFamilies } from "../../schema";

interface DocumentViewerProps {
  content: string;
  comments: Comment[];
  isActive: boolean;
  onTextSelect: (
    text: string,
    startOffset: number,
    endOffset: number,
    selectionTop: number,
  ) => void;
  onHighlightHover?: (commentId: string | undefined) => void;
  onHighlightClick?: (commentId: string) => void;
}

export function DocumentViewer({
  content,
  comments,
  isActive,
  onTextSelect,
  onHighlightHover,
  onHighlightClick,
}: DocumentViewerProps) {
  const { fontFamily } = useSettings();
  const { registerHighlighter } = useCommentActions();
  const pos = usePositions();
  const contentRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const adapterRef = useRef<Highlighter | null>(null);

  useMermaidHydration(contentRef, content);

  useEffect(() => {
    if (!contentRef.current || !containerRef.current) return;

    const adapter = createHighlighter({
      root: contentRef.current,
      container: containerRef.current,
      onSelect: onTextSelect,
    });

    adapterRef.current = adapter;

    registerHighlighter(adapter.setFocused, adapter.scrollToComment);

    const unsubHover = onHighlightHover
      ? adapter.onHighlightHover(onHighlightHover)
      : () => {};

    const unsubClick = onHighlightClick
      ? adapter.onHighlightClick(onHighlightClick)
      : () => {};

    return () => {
      unsubHover();
      unsubClick();
      adapter.dispose();
      adapterRef.current = null;
    };
  }, [onTextSelect, onHighlightHover, onHighlightClick, registerHighlighter]);

  useEffect(() => {
    if (!isActive || !contentRef.current || !containerRef.current) return;
    const adapter = adapterRef.current;
    if (!adapter) return;

    pos.attach(contentRef.current, containerRef.current, adapter);
    pos.cache();
    return () => pos.detach();
  }, [pos, isActive]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: must reapply highlights when content changes
  useEffect(() => {
    if (!isActive) return;
    if (comments.length === 0) return;

    const rafId = requestAnimationFrame(() => {
      const adapter = adapterRef.current;
      if (!adapter) return;

      const highlightComments: HighlightComment[] = comments
        .filter((c) => c.anchorConfidence !== AnchorConfidences.UNRESOLVED)
        .map((c) => ({
          id: c.id,
          selectedText: c.selectedText,
          startOffset: c.startOffset,
          endOffset: c.endOffset,
        }));

      adapter.applyHighlights(highlightComments);
    });

    return () => cancelAnimationFrame(rafId);
  }, [comments, content, isActive, pos]);

  useEffect(() => {
    const handleTestSelect = (e: Event) => {
      const { text, startOffset, endOffset } = (e as CustomEvent).detail;
      onTextSelect(text, startOffset, endOffset, 0);
    };

    window.addEventListener("test:select-text", handleTestSelect);
    return () =>
      window.removeEventListener("test:select-text", handleTestSelect);
  }, [onTextSelect]);

  return (
    <div ref={containerRef} className="flex-1 min-w-0">
      <article
        ref={contentRef}
        className={cn(
          "prose",
          fontFamily === FontFamilies.SANS_SERIF ? "prose-sans" : "prose-serif",
        )}
        // biome-ignore lint/security/noDangerouslySetInnerHtml: trusted local content from user's own files
        dangerouslySetInnerHTML={{ __html: content }}
      />
    </div>
  );
}
