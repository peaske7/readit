import {
  type ComponentPropsWithoutRef,
  useEffect,
  useMemo,
  useRef,
} from "react";
import Markdown from "react-markdown";
import {
  createMarkdownAdapter,
  type HighlightAdapter,
  type HighlightComment,
} from "../lib/highlight";
import { slugify } from "../lib/utils";
import type { Comment, DocumentType, SelectionRange } from "../types";
import { IframeContainer } from "./IframeContainer";

function createHeadingComponent(
  level: 1 | 2 | 3 | 4 | 5 | 6,
  seenIds: Map<string, number>,
) {
  const Tag = `h${level}` as const;

  return function HeadingComponent({
    children,
    ...props
  }: ComponentPropsWithoutRef<typeof Tag>) {
    const text = String(children);
    let id = slugify(text);

    // Handle duplicate IDs
    const count = seenIds.get(id) ?? 0;
    if (count > 0) {
      id = `${id}-${count}`;
    }
    seenIds.set(slugify(text), count + 1);

    return (
      <Tag id={id} {...props}>
        {children}
      </Tag>
    );
  };
}

interface DocumentViewerProps {
  content: string;
  type: DocumentType;
  comments: Comment[];
  pendingSelection?: SelectionRange;
  onTextSelect: (text: string, startOffset: number, endOffset: number) => void;
  onHighlightPositionsChange?: (
    positions: Record<string, number>,
    documentPositions: Record<string, number>,
    pendingTop?: number,
  ) => void;
  onHighlightHover?: (commentId: string | null) => void;
}

export function DocumentViewer({
  content,
  type,
  comments,
  pendingSelection,
  onTextSelect,
  onHighlightPositionsChange,
  onHighlightHover,
}: DocumentViewerProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const adapterRef = useRef<HighlightAdapter | null>(null);
  const seenIdsRef = useRef(new Map<string, number>());

  // Create heading components with shared seenIds tracker
  const headingComponents = useMemo(() => {
    const seenIds = seenIdsRef.current;
    return {
      h1: createHeadingComponent(1, seenIds),
      h2: createHeadingComponent(2, seenIds),
      h3: createHeadingComponent(3, seenIds),
      h4: createHeadingComponent(4, seenIds),
      h5: createHeadingComponent(5, seenIds),
      h6: createHeadingComponent(6, seenIds),
    };
  }, []);

  // Initialize adapter when refs are ready
  useEffect(() => {
    if (type !== "markdown") return;
    if (!contentRef.current || !containerRef.current) return;

    // Create adapter
    const adapter = createMarkdownAdapter({
      root: contentRef.current,
      container: containerRef.current,
      onSelect: onTextSelect,
    });

    adapterRef.current = adapter;

    // Subscribe to position changes
    const unsubPositions = onHighlightPositionsChange
      ? adapter.onPositionsChange((pos) => {
          onHighlightPositionsChange(
            pos.positions,
            pos.documentPositions,
            pos.pendingTop,
          );
        })
      : () => {};

    // Subscribe to hover events
    const unsubHover = onHighlightHover
      ? adapter.onHighlightHover(onHighlightHover)
      : () => {};

    return () => {
      unsubPositions();
      unsubHover();
      adapter.dispose();
      adapterRef.current = null;
    };
  }, [type, onTextSelect, onHighlightPositionsChange, onHighlightHover]);

  // Apply highlights when comments or pending selection change
  // biome-ignore lint/correctness/useExhaustiveDependencies: must reapply highlights when content changes
  useEffect(() => {
    if (type !== "markdown") return;

    // Wait for DOM to be ready after React render
    const timeoutId = requestAnimationFrame(() => {
      const adapter = adapterRef.current;
      if (!adapter) return;

      // Convert Comment[] to HighlightComment[]
      const highlightComments: HighlightComment[] = comments.map((c) => ({
        id: c.id,
        selectedText: c.selectedText,
        startOffset: c.startOffset,
        endOffset: c.endOffset,
      }));

      adapter.applyHighlights(highlightComments, pendingSelection ?? undefined);
    });

    return () => cancelAnimationFrame(timeoutId);
  }, [comments, content, type, pendingSelection]);

  // Test helper: listen for custom event to trigger text selection (E2E testing)
  useEffect(() => {
    if (type !== "markdown") return;

    const handleTestSelect = (e: Event) => {
      const { text, startOffset, endOffset } = (e as CustomEvent).detail;
      onTextSelect(text, startOffset, endOffset);
    };

    window.addEventListener("test:select-text", handleTestSelect);
    return () =>
      window.removeEventListener("test:select-text", handleTestSelect);
  }, [type, onTextSelect]);

  // HTML content - render in isolated iframe
  if (type === "html") {
    return (
      <main className="flex-1 min-w-0 flex flex-col">
        <IframeContainer
          key={content}
          html={content}
          comments={comments}
          pendingSelection={pendingSelection}
          onTextSelect={onTextSelect}
          onHighlightPositionsChange={onHighlightPositionsChange}
          onHighlightHover={onHighlightHover}
        />
      </main>
    );
  }

  // Markdown content - render with react-markdown
  // Note: mouseUp is handled by the adapter internally

  // Reset seen IDs before each render to handle re-renders correctly
  seenIdsRef.current.clear();

  return (
    <div ref={containerRef} className="flex-1 min-w-0">
      <article ref={contentRef} className="prose max-w-none">
        <Markdown key={content} components={headingComponents}>
          {content}
        </Markdown>
      </article>
    </div>
  );
}
