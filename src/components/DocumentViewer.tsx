import {
  type ComponentPropsWithoutRef,
  type MutableRefObject,
  useEffect,
  useMemo,
  useRef,
} from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Heading } from "../hooks/useHeadings";
import {
  createHighlighter,
  type HighlightComment,
  type Highlighter,
} from "../lib/highlight";
import { getTextContent } from "../lib/utils";
import type { Comment, DocumentType, SelectionRange } from "../types";
import { CodeBlock } from "./CodeBlock";
import { IframeContainer } from "./IframeContainer";

function createHeadingComponent(
  level: 1 | 2 | 3 | 4 | 5 | 6,
  headings: Heading[],
  headingIndexRef: MutableRefObject<number>,
) {
  const Tag = `h${level}` as const;

  return function HeadingComponent({
    children,
    ...props
  }: ComponentPropsWithoutRef<typeof Tag>) {
    const text = getTextContent(children);

    // Find the next heading in the pre-computed list that matches this level and text
    // This handles React Strict Mode double-renders by always looking forward from current index
    let id = "";
    for (let i = headingIndexRef.current; i < headings.length; i++) {
      const heading = headings[i];
      if (heading.level === level && heading.text === text) {
        id = heading.id;
        headingIndexRef.current = i + 1;
        break;
      }
    }

    // Fallback: if not found (shouldn't happen), search from beginning
    if (!id) {
      for (const heading of headings) {
        if (heading.level === level && heading.text === text) {
          id = heading.id;
          break;
        }
      }
    }

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
  headings: Heading[];
  pendingSelection?: SelectionRange;
  onTextSelect: (text: string, startOffset: number, endOffset: number) => void;
  onHighlightPositionsChange?: (
    positions: Record<string, number>,
    documentPositions: Record<string, number>,
    pendingTop?: number,
  ) => void;
  onHighlightHover?: (commentId: string | undefined) => void;
}

export function DocumentViewer({
  content,
  type,
  comments,
  headings,
  pendingSelection,
  onTextSelect,
  onHighlightPositionsChange,
  onHighlightHover,
}: DocumentViewerProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const adapterRef = useRef<Highlighter | null>(null);
  const headingIndexRef = useRef(0);

  // Initialize adapter when refs are ready
  useEffect(() => {
    if (type !== "markdown") return;
    if (!contentRef.current || !containerRef.current) return;

    // Create highlighter
    const adapter = createHighlighter({
      type: "markdown",
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

  // Memoize markdown components to prevent React from replacing DOM nodes on re-render.
  // This is critical for highlight persistence - without memoization, new component
  // references cause React to unmount/remount headings, removing our DOM-injected marks.
  // Note: Must be called before any conditional returns to satisfy React's rules of hooks.
  const markdownComponents = useMemo(
    () => ({
      h1: createHeadingComponent(1, headings, headingIndexRef),
      h2: createHeadingComponent(2, headings, headingIndexRef),
      h3: createHeadingComponent(3, headings, headingIndexRef),
      h4: createHeadingComponent(4, headings, headingIndexRef),
      h5: createHeadingComponent(5, headings, headingIndexRef),
      h6: createHeadingComponent(6, headings, headingIndexRef),
      code: CodeBlock,
    }),
    [headings],
  );

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

  // Reset heading index for each render to handle React Strict Mode double-renders
  headingIndexRef.current = 0;

  return (
    <div ref={containerRef} className="flex-1 min-w-0">
      <article ref={contentRef} className="prose">
        <Markdown
          key={content}
          components={markdownComponents}
          remarkPlugins={[remarkGfm]}
        >
          {content}
        </Markdown>
      </article>
    </div>
  );
}
