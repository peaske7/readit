/**
 * Builds the JavaScript script to be injected into the iframe.
 *
 * This script contains the core highlighting functions that run inside
 * the sandboxed iframe, communicating with the parent via postMessage.
 *
 * IMPORTANT: DUPLICATED FUNCTIONS
 * ================================
 * The following functions are duplicated from TypeScript sources.
 * They must be kept in sync manually. When modifying any of these
 * functions, update BOTH locations.
 *
 * Duplicated from core.ts:
 *   - findTextPosition()
 *
 * Duplicated from dom.ts:
 *   - getTextOffset()
 *   - getDOMTextContent()
 *   - collectTextNodes()
 *   - applyHighlightToRange()
 *   - clearHighlights()
 *   - collectHighlightPositions() (viewport variant)
 *
 * Why duplication exists:
 *   The iframe runs in a sandboxed environment and receives content
 *   via srcdoc. It cannot import TypeScript modules. The functions
 *   must be embedded as plain JavaScript strings.
 *
 * Keeping them in sync:
 *   The TypeScript sources (core.ts, dom.ts) are the source of truth.
 *   Tests in core.test.ts verify the behavior. If you change the
 *   TypeScript implementation, manually update the corresponding
 *   function here to match.
 */

/**
 * Build the complete iframe script with parent origin for secure postMessage.
 */
export function buildIframeScript(parentOrigin: string): string {
  return `
<script>
(function() {
  const parentOrigin = ${JSON.stringify(parentOrigin)};
  const root = document.body;

  // --- Core Functions (from core.ts) ---

  function findTextPosition(textContent, selectedText, hintOffset) {
    if (!selectedText || !textContent) {
      return null;
    }

    const occurrences = [];
    let idx = 0;

    for (;;) {
      idx = textContent.indexOf(selectedText, idx);
      if (idx === -1) break;
      occurrences.push(idx);
      idx += 1;
    }

    if (occurrences.length === 0) {
      return null;
    }

    if (occurrences.length === 1) {
      return {
        start: occurrences[0],
        end: occurrences[0] + selectedText.length,
      };
    }

    // Multiple occurrences: find closest to hint offset
    const target = hintOffset ?? 0;
    let closest = occurrences[0];
    let minDist = Math.abs(closest - target);

    for (const occ of occurrences) {
      const dist = Math.abs(occ - target);
      if (dist < minDist) {
        minDist = dist;
        closest = occ;
      }
    }

    return {
      start: closest,
      end: closest + selectedText.length,
    };
  }

  // --- DOM Functions (from dom.ts) ---

  function getTextOffset(root, targetNode, targetOffset) {
    let offset = 0;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);

    let node = walker.nextNode();
    while (node) {
      if (node === targetNode) {
        return offset + targetOffset;
      }
      offset += (node.textContent?.length ?? 0);
      node = walker.nextNode();
    }

    return offset;
  }

  function getDOMTextContent(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let text = '';
    let node = walker.nextNode();

    while (node) {
      text += node.textContent ?? '';
      node = walker.nextNode();
    }

    return text;
  }

  function collectTextNodes(root) {
    const textNodes = [];
    let currentOffset = 0;

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();

    while (node) {
      const length = node.textContent?.length ?? 0;
      textNodes.push({
        node: node,
        start: currentOffset,
        end: currentOffset + length,
      });
      currentOffset += length;
      node = walker.nextNode();
    }

    return textNodes;
  }

  function applyHighlightToRange(root, startOffset, endOffset, style) {
    const textNodes = collectTextNodes(root);

    const overlappingNodes = textNodes.filter(
      n => n.end > startOffset && n.start < endOffset
    );

    if (overlappingNodes.length === 0) {
      return;
    }

    for (const { node: textNode, start } of overlappingNodes) {
      const nodeStart = Math.max(0, startOffset - start);
      const nodeEnd = Math.min(textNode.length, endOffset - start);

      if (nodeStart >= nodeEnd) {
        continue;
      }

      const range = document.createRange();
      range.setStart(textNode, nodeStart);
      range.setEnd(textNode, nodeEnd);

      const mark = document.createElement('mark');
      mark.setAttribute(style.attribute, style.attributeValue);

      try {
        range.surroundContents(mark);
      } catch (e) {
        // Range crosses element boundaries, skip
      }
    }
  }

  function clearHighlights(root) {
    const marks = root.querySelectorAll('mark[data-comment-id], mark[data-pending]');

    for (const mark of marks) {
      const parent = mark.parentNode;
      if (parent) {
        while (mark.firstChild) {
          parent.insertBefore(mark.firstChild, mark);
        }
        parent.removeChild(mark);
      }
    }
  }

  function collectHighlightPositions(root) {
    const positions = {};
    const documentPositions = {};
    const scrollY = window.scrollY || 0;

    const marks = root.querySelectorAll('mark[data-comment-id]');
    for (const mark of marks) {
      const commentId = mark.getAttribute('data-comment-id');
      if (!commentId || positions[commentId] !== undefined) continue;

      const rect = mark.getBoundingClientRect();
      positions[commentId] = rect.top;
      documentPositions[commentId] = rect.top + scrollY;
    }

    let pendingTop = null;
    const pendingMark = root.querySelector('mark[data-pending]');
    if (pendingMark) {
      const pendingRect = pendingMark.getBoundingClientRect();
      pendingTop = pendingRect.top;
    }

    return { positions, documentPositions, pendingTop };
  }

  // --- Selection Handler ---

  document.addEventListener('mouseup', function() {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return;

    const text = selection.toString().trim();
    if (text.length === 0) return;

    const range = selection.getRangeAt(0);
    const startOffset = getTextOffset(root, range.startContainer, range.startOffset);
    const endOffset = getTextOffset(root, range.endContainer, range.endOffset);

    parent.postMessage({
      type: 'textSelection',
      text: text,
      startOffset: startOffset,
      endOffset: endOffset
    }, parentOrigin);
  });

  // --- Message Handler ---

  window.addEventListener('message', function(event) {
    // Handle scroll to heading request from parent
    if (event.data.type === 'scrollToHeading') {
      const id = event.data.id;
      const element = document.getElementById(id);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      return;
    }

    if (event.data.type === 'applyHighlights') {
      clearHighlights(root);

      const comments = event.data.comments || [];
      const pending = event.data.pendingSelection;

      const textContent = getDOMTextContent(root);

      // Resolve anchors and apply highlights
      const resolved = comments
        .map(function(c) {
          const anchor = findTextPosition(textContent, c.selectedText, c.startOffset);
          if (anchor) {
            return { id: c.id, startOffset: anchor.start, endOffset: anchor.end };
          }
          return { id: c.id, startOffset: c.startOffset, endOffset: c.endOffset };
        })
        .sort(function(a, b) { return a.startOffset - b.startOffset; });

      for (const comment of resolved) {
        applyHighlightToRange(root, comment.startOffset, comment.endOffset, {
          attribute: 'data-comment-id',
          attributeValue: comment.id
        });
      }

      if (pending) {
        applyHighlightToRange(root, pending.startOffset, pending.endOffset, {
          attribute: 'data-pending',
          attributeValue: 'true'
        });
      }

      setTimeout(function() {
        reportPositions();
        reportContentHeight();
      }, 50);
    }
  });

  // --- Position Reporting ---

  function reportPositions() {
    const result = collectHighlightPositions(root);
    parent.postMessage({
      type: 'highlightPositions',
      positions: result.positions,
      documentPositions: result.documentPositions,
      pendingTop: result.pendingTop
    }, parentOrigin);
  }

  // --- Content Height Reporting ---

  function reportContentHeight() {
    parent.postMessage({
      type: 'contentHeight',
      height: document.body.scrollHeight
    }, parentOrigin);
  }

  window.addEventListener('scroll', reportPositions, { passive: true });
  document.addEventListener('scroll', reportPositions, { passive: true });
  window.addEventListener('resize', function() {
    reportPositions();
    reportContentHeight();
  });
  window.addEventListener('load', reportContentHeight);

  // --- Hover Handlers ---

  document.addEventListener('mouseover', function(e) {
    const mark = e.target.closest('mark[data-comment-id]');
    if (mark) {
      parent.postMessage({
        type: 'highlightHover',
        commentId: mark.getAttribute('data-comment-id')
      }, parentOrigin);
    }
  });

  document.addEventListener('mouseout', function(e) {
    const mark = e.target.closest('mark[data-comment-id]');
    if (mark) {
      const related = e.relatedTarget?.closest?.('mark[data-comment-id]');
      if (!related || related.getAttribute('data-comment-id') !== mark.getAttribute('data-comment-id')) {
        parent.postMessage({ type: 'highlightHover', commentId: null }, parentOrigin);
      }
    }
  });

  // --- Ready Signal ---

  parent.postMessage({ type: 'iframeReady' }, parentOrigin);

  // --- Ensure Heading IDs for TOC navigation ---

  function ensureHeadingIds() {
    const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
    const seenIds = {};

    for (const heading of headings) {
      if (!heading.id) {
        let id = (heading.textContent || '')
          .toLowerCase()
          .trim()
          .replace(/[^a-z0-9 -]/g, '')
          .replace(/ +/g, '-')
          .replace(/-+/g, '-');

        // Handle duplicates
        const baseId = id;
        const count = seenIds[baseId] || 0;
        if (count > 0) {
          id = baseId + '-' + count;
        }
        seenIds[baseId] = count + 1;

        heading.id = id;
      }
    }
  }
  ensureHeadingIds();

  // Height reporting delays to catch layout shifts
  const HEIGHT_REPORT_DELAY_SHORT = 100;
  const HEIGHT_REPORT_DELAY_LONG = 500;

  // Report initial height reliably - use multiple strategies
  function scheduleHeightReport() {
    // Immediate report
    reportContentHeight();
    // Delayed report to catch layout shifts
    setTimeout(reportContentHeight, HEIGHT_REPORT_DELAY_SHORT);
    setTimeout(reportContentHeight, HEIGHT_REPORT_DELAY_LONG);
  }

  if (document.readyState === 'complete') {
    scheduleHeightReport();
  } else {
    window.addEventListener('load', scheduleHeightReport);
  }

  // Watch for content size changes with ResizeObserver
  if (typeof ResizeObserver !== 'undefined') {
    const resizeObserver = new ResizeObserver(function() {
      reportContentHeight();
    });
    resizeObserver.observe(document.body);
  }
})();
</script>
`;
}
