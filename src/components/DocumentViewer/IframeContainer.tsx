import DOMPurify from "dompurify";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePositions } from "../../contexts/PositionsContext";
import {
  buildIframeScript,
  createHighlighter,
  type HighlightComment,
  type Highlighter,
} from "../../lib/highlight";
import {
  AnchorConfidences,
  type Comment,
  FontFamilies,
  type FontFamily,
  type SelectionRange,
} from "../../types";

interface IframeContainerProps {
  html: string;
  comments: Comment[];
  pendingSelection?: SelectionRange;
  onTextSelect: (
    text: string,
    startOffset: number,
    endOffset: number,
    selectionTop: number,
  ) => void;
  onHighlightHover?: (commentId: string | undefined) => void;
  onHighlightClick?: (commentId: string) => void;
  fontFamily?: FontFamily;
}

const FONT_SERIF =
  'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif';
const FONT_SANS =
  'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

function getFontStack(fontFamily: FontFamily): string {
  return fontFamily === FontFamilies.SANS_SERIF ? FONT_SANS : FONT_SERIF;
}

// Layout styles use !important; prose styles use :where() for zero specificity
function getBaseStyles(fontFamily: FontFamily): string {
  const fontStack = getFontStack(fontFamily);
  return `
  /* Critical layout - must override external CSS to ensure proper sizing */
  html {
    width: 100% !important;
  }
  body {
    width: 100% !important;
    min-width: 65ch;
    box-sizing: border-box !important;
    margin: 0;
  }

  /* Prose styles as fallback - zero specificity via :where(), easily overridden */
  :where(body:not([class])) {
    max-width: 65ch;
    margin-left: auto;
    margin-right: auto;
    padding: 2rem 1rem;
    line-height: 1.75;
    color: #3f3f46;
    font-family: ${fontStack};
  }
  :where(body:not([class])) :where(h1, h2, h3, h4, h5, h6) {
    color: #18181b;
    font-weight: 600;
    line-height: 1.25;
    margin-top: 2em;
    margin-bottom: 0.5em;
  }
  :where(body:not([class])) :where(h1) { font-size: 2.25em; margin-top: 0; }
  :where(body:not([class])) :where(h2) { font-size: 1.5em; }
  :where(body:not([class])) :where(h3) { font-size: 1.25em; }
  :where(body:not([class])) :where(h4) { font-size: 1.125em; }
  :where(body:not([class])) :where(p) { margin: 1em 0; }
  :where(body:not([class])) :where(ul, ol) { padding-left: 1.5em; margin: 1em 0; }
  :where(body:not([class])) :where(li) { margin: 0.5em 0; }
  :where(body:not([class])) :where(a) { color: #2563eb; text-decoration: underline; }
  :where(body:not([class])) :where(code) { background: #f4f4f5; padding: 0.2em 0.4em; border-radius: 0.25em; font-size: 0.875em; }
  :where(body:not([class])) :where(pre) { background: #f4f4f5; padding: 1em; border-radius: 0.5em; overflow-x: auto; }
  :where(body:not([class])) :where(pre code) { background: none; padding: 0; }
  :where(body:not([class])) :where(blockquote) { border-left: 4px solid #e4e4e7; padding-left: 1em; color: #71717a; margin: 1em 0; font-style: italic; }
  :where(body:not([class])) :where(hr) { border: none; border-top: 1px solid #e4e4e7; margin: 2em 0; }
  :where(body:not([class])) :where(table) { border-collapse: collapse; width: 100%; margin: 1em 0; }
  :where(body:not([class])) :where(th, td) { border: 1px solid #e4e4e7; padding: 0.5em 1em; text-align: left; }
  :where(body:not([class])) :where(th) { background: #fafafa; font-weight: 600; }
  :where(body:not([class])) :where(img) { max-width: 100%; height: auto; }

  /* Highlight styles - warm ink palette */
  mark[data-comment-id] {
    background: rgba(245, 222, 160, 0.5);
    cursor: pointer;
    transition: background-color 0.15s ease;
  }
  mark[data-comment-id]:hover {
    background-color: rgba(228, 195, 110, 0.65);
  }
  mark[data-comment-id]:active {
    background-color: rgba(228, 195, 110, 0.75);
  }
  mark[data-pending] { background: rgba(180, 180, 180, 0.3); cursor: text; }
`;
}

function sanitizeHtml(html: string): string {
  const sanitized = DOMPurify.sanitize(html, {
    ADD_TAGS: ["style"],
    ADD_ATTR: ["style"],
    FORBID_TAGS: ["script", "iframe", "object", "embed", "form"],
    FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover"],
  });

  // Escape </iframe> to prevent breaking out of srcdoc
  return sanitized.replace(/<\/iframe/gi, "&lt;/iframe");
}

function injectStyleTag(html: string, styleTag: string): string {
  if (/<\/head>/i.test(html)) {
    return html.replace(/<\/head>/i, `${styleTag}</head>`);
  }
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/(<head[^>]*>)/i, `$1${styleTag}`);
  }
  return styleTag + html;
}

export function IframeContainer({
  html,
  comments,
  pendingSelection,
  onTextSelect,
  onHighlightHover,
  onHighlightClick,
  fontFamily = FontFamilies.SERIF,
}: IframeContainerProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const adapterRef = useRef<Highlighter | null>(null);
  const [contentHeight, setContentHeight] = useState<number>(0);
  const pos = usePositions();

  const srcdoc = useMemo(() => {
    const sanitized = sanitizeHtml(html);
    const baseStyles = getBaseStyles(fontFamily);
    const styleTag = `<style id="readit-base-styles">${baseStyles}</style>`;

    const finalHtml = injectStyleTag(sanitized, styleTag);

    return finalHtml + buildIframeScript(window.location.origin);
  }, [html, fontFamily]);

  useEffect(() => {
    const adapter = createHighlighter({
      type: "iframe",
      getIframe: () => iframeRef.current,
      onSelect: onTextSelect,
    });

    adapterRef.current = adapter;

    const unsubPositions = adapter.onPositionsChange((hp) => {
      const iframe = iframeRef.current;
      const iframeOffset = iframe
        ? iframe.getBoundingClientRect().top + window.scrollY
        : 0;

      const adjusted: Record<string, number> = {};
      for (const [id, iframeTop] of Object.entries(hp.documentPositions)) {
        adjusted[id] = iframeTop + iframeOffset;
      }

      pos.setExternal(hp.positions, adjusted);
    });

    const unsubHover = onHighlightHover
      ? adapter.onHighlightHover(onHighlightHover)
      : () => {};

    const unsubClick = onHighlightClick
      ? adapter.onHighlightClick(onHighlightClick)
      : () => {};

    const unsubHeight = adapter.onContentHeightChange?.((height) => {
      setContentHeight(height);
    });

    return () => {
      unsubPositions();
      unsubHover();
      unsubClick();
      unsubHeight?.();
      adapter.dispose();
      adapterRef.current = null;
    };
  }, [onTextSelect, onHighlightHover, onHighlightClick, pos]);

  useEffect(() => {
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

    adapter.applyHighlights(highlightComments, pendingSelection ?? undefined);
  }, [comments, pendingSelection]);

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
    <iframe
      ref={iframeRef}
      srcDoc={srcdoc}
      sandbox="allow-scripts allow-same-origin"
      title="Document content"
      className="w-full border-0"
      style={{ height: contentHeight || "100%" }}
    />
  );
}
