import DOMPurify from "dompurify";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  buildIframeScript,
  createIframeAdapter,
  type HighlightComment,
  type IframeHighlightAdapter,
} from "../lib/highlight";
import type { Comment, SelectionRange } from "../types";

interface IframeContainerProps {
  html: string;
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

/**
 * Base styles injected into the iframe.
 * Critical layout styles use !important to ensure proper sizing.
 * Prose styles use :where() for zero specificity (easily overridden by external CSS).
 */
const baseStyles = `
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
    color: #374151;
    font-family: ui-serif, Georgia, Cambria, "Times New Roman", Times, serif;
  }
  :where(body:not([class])) :where(h1, h2, h3, h4, h5, h6) {
    color: #111827;
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
  :where(body:not([class])) :where(code) { background: #f3f4f6; padding: 0.2em 0.4em; border-radius: 0.25em; font-size: 0.875em; }
  :where(body:not([class])) :where(pre) { background: #f3f4f6; padding: 1em; border-radius: 0.5em; overflow-x: auto; }
  :where(body:not([class])) :where(pre code) { background: none; padding: 0; }
  :where(body:not([class])) :where(blockquote) { border-left: 4px solid #e5e7eb; padding-left: 1em; color: #6b7280; margin: 1em 0; font-style: italic; }
  :where(body:not([class])) :where(hr) { border: none; border-top: 1px solid #e5e7eb; margin: 2em 0; }
  :where(body:not([class])) :where(table) { border-collapse: collapse; width: 100%; margin: 1em 0; }
  :where(body:not([class])) :where(th, td) { border: 1px solid #e5e7eb; padding: 0.5em 1em; text-align: left; }
  :where(body:not([class])) :where(th) { background: #f9fafb; font-weight: 600; }
  :where(body:not([class])) :where(img) { max-width: 100%; height: auto; }

  /* Highlight styles - always applied */
  mark[data-comment-id] {
    background: rgba(254, 249, 195, 0.6);
    cursor: pointer;
    transition: background-color 0.15s ease;
  }
  mark[data-comment-id]:hover {
    background-color: rgba(254, 249, 195, 0.9);
  }
  mark[data-comment-id]:active {
    background-color: rgba(253, 224, 71, 0.7);
  }
  mark[data-pending] { background: rgba(253, 224, 71, 0.5); cursor: text; }
`;

/**
 * Sanitizes HTML using DOMPurify while preserving styles.
 * Removes scripts, event handlers, and dangerous URLs.
 */
function sanitizeHtml(html: string): string {
  // Configure DOMPurify to allow styles but remove scripts
  const sanitized = DOMPurify.sanitize(html, {
    // Allow all safe tags including style
    ADD_TAGS: ["style"],
    // Allow style attribute on elements
    ADD_ATTR: ["style"],
    // Remove dangerous elements
    FORBID_TAGS: ["script", "iframe", "object", "embed", "form"],
    // Remove event handlers and dangerous attributes
    FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover"],
  });

  // Escape </iframe> to prevent breaking out of srcdoc
  // (DOMPurify removes iframe tags, but this is extra protection for edge cases)
  return sanitized.replace(/<\/iframe/gi, "&lt;/iframe");
}

/**
 * Injects a style tag into HTML. Prefers end of <head>, falls back to
 * after <head> opening, or prepends if no head tag exists.
 */
function injectStyleTag(html: string, styleTag: string): string {
  if (/<\/head>/i.test(html)) {
    return html.replace(/<\/head>/i, `${styleTag}</head>`);
  }
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/(<head[^>]*>)/i, `$1${styleTag}`);
  }
  return styleTag + html;
}

/**
 * Renders HTML content inside a sandboxed iframe for complete CSS isolation.
 * Communicates with parent via postMessage for text selection and highlighting.
 */
export function IframeContainer({
  html,
  comments,
  pendingSelection,
  onTextSelect,
  onHighlightPositionsChange,
  onHighlightHover,
}: IframeContainerProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const adapterRef = useRef<IframeHighlightAdapter | null>(null);
  const [contentHeight, setContentHeight] = useState<number>(600);

  // Build the complete HTML document for the iframe
  const srcdoc = useMemo(() => {
    const sanitized = sanitizeHtml(html);
    const styleTag = `<style id="readit-base-styles">${baseStyles}</style>`;

    const finalHtml = injectStyleTag(sanitized, styleTag);

    // Append the highlight script from the shared module
    return finalHtml + buildIframeScript(window.location.origin);
  }, [html]);

  // Initialize adapter
  useEffect(() => {
    const adapter = createIframeAdapter({
      getIframe: () => iframeRef.current,
      onSelect: onTextSelect,
    });

    adapterRef.current = adapter;

    // Subscribe to position changes
    // Convert iframe-relative positions to main document positions
    const unsubPositions = onHighlightPositionsChange
      ? adapter.onPositionsChange((pos) => {
          const iframe = iframeRef.current;
          const iframeOffset = iframe
            ? iframe.getBoundingClientRect().top + window.scrollY
            : 0;

          // Adjust documentPositions to main document coordinates
          const adjustedDocPositions: Record<string, number> = {};
          for (const [id, iframePos] of Object.entries(pos.documentPositions)) {
            adjustedDocPositions[id] = iframePos + iframeOffset;
          }

          onHighlightPositionsChange(
            pos.positions,
            adjustedDocPositions,
            pos.pendingTop,
          );
        })
      : () => {};

    // Subscribe to hover events
    const unsubHover = onHighlightHover
      ? adapter.onHighlightHover(onHighlightHover)
      : () => {};

    // Subscribe to content height changes for auto-sizing
    const unsubHeight = adapter.onContentHeightChange((height) => {
      setContentHeight(height);
    });

    return () => {
      unsubPositions();
      unsubHover();
      unsubHeight();
      adapter.dispose();
      adapterRef.current = null;
    };
  }, [onTextSelect, onHighlightPositionsChange, onHighlightHover]);

  // Send highlight updates when comments or pending selection change
  useEffect(() => {
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
  }, [comments, pendingSelection]);

  // Test helper: listen for custom event to trigger text selection (E2E testing)
  useEffect(() => {
    const handleTestSelect = (e: Event) => {
      const { text, startOffset, endOffset } = (e as CustomEvent).detail;
      onTextSelect(text, startOffset, endOffset);
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
      style={{ height: contentHeight }}
    />
  );
}
