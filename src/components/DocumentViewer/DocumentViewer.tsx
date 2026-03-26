import {
  type ComponentPropsWithoutRef,
  type MutableRefObject,
  memo,
  useEffect,
  useMemo,
  useRef,
} from "react";
import Markdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import remarkGfm from "remark-gfm";
import { usePositions } from "../../contexts/PositionsContext";
import { useSettings } from "../../contexts/SettingsContext";
import type { Heading } from "../../hooks/useHeadings";
import {
  createHighlighter,
  type HighlightComment,
  type Highlighter,
} from "../../lib/highlight";
import { cn, getTextContent } from "../../lib/utils";
import {
  AnchorConfidences,
  type Comment,
  type DocumentType,
  FontFamilies,
  type SelectionRange,
} from "../../types";
import { IframeContainer } from "./IframeContainer";
import { createCodeComponent } from "./InlineCode";

const REMARK_PLUGINS = [remarkGfm];
const REHYPE_PLUGINS = [rehypeRaw];

/** Memoized Markdown renderer — skips reconciliation when only comments change. */
const MemoizedMarkdown = memo(function MemoizedMarkdown({
  content,
  components,
}: {
  content: string;
  components: ComponentPropsWithoutRef<typeof Markdown>["components"];
}) {
  return (
    <Markdown
      components={components}
      remarkPlugins={REMARK_PLUGINS}
      rehypePlugins={REHYPE_PLUGINS}
    >
      {content}
    </Markdown>
  );
});

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
  type,
  comments,
  headings,
  pendingSelection,
  onTextSelect,
  onHighlightHover,
  onHighlightClick,
}: DocumentViewerProps) {
  const { fontFamily } = useSettings();
  const pos = usePositions();
  const contentRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const adapterRef = useRef<Highlighter | null>(null);
  const headingIndexRef = useRef(0);

  // Attach/detach pos to DOM elements for direct position reads
  useEffect(() => {
    if (type !== "markdown") return;
    if (!contentRef.current || !containerRef.current) return;
    pos.attach(contentRef.current, containerRef.current);
    return () => pos.detach();
  }, [type, pos]);

  useEffect(() => {
    if (type !== "markdown") return;
    if (!contentRef.current || !containerRef.current) return;

    const adapter = createHighlighter({
      type: "markdown",
      root: contentRef.current,
      container: containerRef.current,
      onSelect: onTextSelect,
    });

    adapterRef.current = adapter;

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
  }, [type, onTextSelect, onHighlightHover, onHighlightClick]);

  // Double RAF: ensures React commit phase completes before DOM queries.
  // See: https://github.com/facebook/react/issues/20863
  // biome-ignore lint/correctness/useExhaustiveDependencies: must reapply highlights when content or components change
  useEffect(() => {
    if (type !== "markdown") return;

    let outerFrameId: number;
    let innerFrameId: number;

    outerFrameId = requestAnimationFrame(() => {
      innerFrameId = requestAnimationFrame(() => {
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
        // Engine auto-detects mark changes via MutationObserver
      });
    });

    return () => {
      cancelAnimationFrame(outerFrameId);
      cancelAnimationFrame(innerFrameId);
    };
  }, [comments, content, type, pos]);

  useEffect(() => {
    if (type !== "markdown") return;

    const handleTestSelect = (e: Event) => {
      const { text, startOffset, endOffset } = (e as CustomEvent).detail;
      onTextSelect(text, startOffset, endOffset, 0);
    };

    window.addEventListener("test:select-text", handleTestSelect);
    return () =>
      window.removeEventListener("test:select-text", handleTestSelect);
  }, [type, onTextSelect]);

  // Memoized to prevent DOM node replacement (breaks highlight persistence)
  const markdownComponents = useMemo(
    () => ({
      h1: createHeadingComponent(1, headings, headingIndexRef),
      h2: createHeadingComponent(2, headings, headingIndexRef),
      h3: createHeadingComponent(3, headings, headingIndexRef),
      h4: createHeadingComponent(4, headings, headingIndexRef),
      h5: createHeadingComponent(5, headings, headingIndexRef),
      h6: createHeadingComponent(6, headings, headingIndexRef),
      code: createCodeComponent(),
    }),
    [headings],
  );

  if (type === "html") {
    return (
      <main className="flex-1 min-w-0 flex flex-col">
        <IframeContainer
          html={content}
          comments={comments}
          pendingSelection={pendingSelection}
          onTextSelect={onTextSelect}
          onHighlightHover={onHighlightHover}
          onHighlightClick={onHighlightClick}
          fontFamily={fontFamily}
        />
      </main>
    );
  }

  headingIndexRef.current = 0;

  return (
    <div ref={containerRef} className="flex-1 min-w-0">
      <article
        ref={contentRef}
        className={cn(
          "prose",
          fontFamily === FontFamilies.SANS_SERIF ? "prose-sans" : "prose-serif",
        )}
      >
        <MemoizedMarkdown content={content} components={markdownComponents} />
      </article>
    </div>
  );
}
