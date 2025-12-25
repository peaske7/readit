import { useCallback, useEffect, useMemo } from "react";
import { Toaster, toast } from "sonner";
import {
  CommentInputArea,
  CommentMinimap,
  CommentNavigator,
  DocumentViewer,
  Header,
  MarginNotesContainer,
  TableOfContents,
} from "./components";
import {
  useCommentNavigation,
  useComments,
  useDocument,
  useHeadings,
  useReanchorMode,
  useScrollMetrics,
  useScrollSpy,
  useTextSelection,
} from "./hooks";
import { extractContext, formatForLLM } from "./lib/context";
import {
  exportCommentsAsJson,
  generatePrompt,
  generateRawText,
} from "./lib/export";
import { calculateScrollTarget, getElementTopInDocument } from "./lib/scroll";
import type { Comment } from "./types";

function truncate(text: string, maxLength = 30): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}…`;
}

function App() {
  // Document loading and live reload
  const { document, error, reload } = useDocument();

  // Text selection and highlight positions
  const {
    selection,
    highlightPositions,
    documentPositions,
    pendingSelectionTop,
    onTextSelect,
    onPositionsChange,
    clearSelection,
  } = useTextSelection();

  // Comments CRUD
  const {
    comments,
    error: commentsError,
    addComment,
    deleteComment,
    editComment,
    reanchorComment,
  } = useComments(document?.filePath || null, { clean: document?.clean });

  // Re-anchor mode for unresolved comments
  const { reanchorTarget, startReanchor, cancelReanchor } = useReanchorMode();

  // Sort comments by document position
  const sortedComments = useMemo(
    () => [...comments].sort((a, b) => a.startOffset - b.startOffset),
    [comments],
  );

  // Comment navigation with keyboard shortcuts
  const {
    currentIndex,
    hoveredCommentId,
    setHoveredCommentId,
    navigateToComment,
    navigatePrevious,
    navigateNext,
  } = useCommentNavigation(sortedComments);

  // Scroll metrics for minimap
  const scrollMetrics = useScrollMetrics();

  // Table of contents
  const headings = useHeadings(
    document?.content ?? null,
    document?.type ?? null,
  );
  const activeHeadingId = useScrollSpy(headings.map((h) => h.id));

  const scrollToHeading = useCallback(
    (id: string) => {
      let element: Element | null = null;
      let elementTop: number;

      if (document?.type === "html") {
        const iframe = window.document.querySelector("iframe");
        element = iframe?.contentDocument?.getElementById(id) ?? null;

        if (element && iframe) {
          // For iframes: calculate position relative to main document
          // The iframe is auto-sized (no internal scroll), so we scroll the main window
          const iframeRect = iframe.getBoundingClientRect();
          elementTop = getElementTopInDocument(
            element.getBoundingClientRect(),
            window.scrollY,
            iframeRect.top,
          );
        } else {
          return;
        }
      } else {
        element = window.document.getElementById(id);

        if (element) {
          elementTop = getElementTopInDocument(
            element.getBoundingClientRect(),
            window.scrollY,
          );
        } else {
          return;
        }
      }

      const scrollTarget = calculateScrollTarget(
        elementTop,
        window.innerHeight,
      );
      window.scrollTo({ top: scrollTarget, behavior: "smooth" });
    },
    [document?.type],
  );

  // Connect to heartbeat SSE - keeps server alive while tab is open
  useEffect(() => {
    const eventSource = new EventSource("/api/heartbeat");
    return () => eventSource.close();
  }, []);

  // Show comments errors as toast
  useEffect(() => {
    if (commentsError) {
      toast.error(commentsError);
    }
  }, [commentsError]);

  // Add comment handler
  const handleAddComment = useCallback(
    (commentText: string) => {
      if (!selection) return;

      addComment(
        selection.text,
        commentText,
        selection.startOffset,
        selection.endOffset,
      );

      clearSelection();
    },
    [selection, addComment, clearSelection],
  );

  // Re-anchor confirmation handler
  const handleConfirmReanchor = useCallback(() => {
    if (!selection || !reanchorTarget) return;

    reanchorComment(
      reanchorTarget.commentId,
      selection.text,
      selection.startOffset,
      selection.endOffset,
    );

    cancelReanchor();
    clearSelection();
  }, [
    selection,
    reanchorTarget,
    reanchorComment,
    cancelReanchor,
    clearSelection,
  ]);

  // Cancel re-anchor and clear selection
  const handleCancelReanchor = useCallback(() => {
    cancelReanchor();
    clearSelection();
  }, [cancelReanchor, clearSelection]);

  // Export handlers
  const handleCopyAll = useCallback(() => {
    if (!document) return;
    const prompt = generatePrompt(comments, document.fileName);
    navigator.clipboard.writeText(prompt);
    toast.success("Copied all comments");
  }, [comments, document]);

  const handleCopyAllRaw = useCallback(() => {
    if (!document) return;
    const raw = generateRawText(comments);
    navigator.clipboard.writeText(raw);
    toast.success("Copied all comments as raw text");
  }, [comments, document]);

  const handleExportJson = useCallback(() => {
    if (!document) return;
    exportCommentsAsJson(comments, document);
  }, [comments, document]);

  // Copy handlers
  const handleCopySelectionRaw = useCallback(() => {
    if (!selection) return;

    navigator.clipboard.writeText(selection.text);
    toast.success(`Copied: "${truncate(selection.text)}"`);
    clearSelection();
  }, [selection, clearSelection]);

  const handleCopySelectionForLLM = useCallback(() => {
    if (!selection || !document) return;

    const context = extractContext(
      document.content,
      selection.startOffset,
      selection.endOffset,
    );
    const formatted = formatForLLM({
      context,
      fileName: document.fileName,
    });

    navigator.clipboard.writeText(formatted);
    toast.success(`Copied for LLM: "${truncate(selection.text)}"`);
    clearSelection();
  }, [selection, document, clearSelection]);

  const handleCopyCommentRaw = useCallback((comment: Comment) => {
    const raw = `${comment.selectedText}\n\n${comment.comment}`;
    navigator.clipboard.writeText(raw);
    toast.success(`Copied: "${truncate(comment.comment)}"`);
  }, []);

  const handleCopyCommentForLLM = useCallback(
    (comment: Comment) => {
      if (!document) return;

      const context = extractContext(
        document.content,
        comment.startOffset,
        comment.endOffset,
      );
      const formatted = formatForLLM({
        context,
        fileName: document.fileName,
        comment: comment.comment,
      });

      navigator.clipboard.writeText(formatted);
      toast.success(`Copied for LLM: "${truncate(comment.comment)}"`);
    },
    [document],
  );

  // Keyboard shortcuts: Cmd+C for raw copy, Cmd+Shift+C for LLM copy
  useEffect(() => {
    if (!selection) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "c" && e.metaKey) {
        e.preventDefault();
        if (e.shiftKey) {
          handleCopySelectionForLLM();
        } else {
          handleCopySelectionRaw();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selection, handleCopySelectionRaw, handleCopySelectionForLLM]);

  // Update data-focused attribute on highlight marks when hover state changes
  useEffect(() => {
    const marks = window.document.querySelectorAll("mark[data-comment-id]");
    for (const mark of marks) {
      const commentId = mark.getAttribute("data-comment-id");
      if (commentId === hoveredCommentId) {
        mark.setAttribute("data-focused", "true");
      } else {
        mark.removeAttribute("data-focused");
      }
    }
  }, [hoveredCommentId]);

  if (error) {
    return (
      <div className="min-h-screen bg-white text-gray-900 flex items-center justify-center">
        <div className="text-red-600">{error}</div>
      </div>
    );
  }

  if (!document) {
    return (
      <div className="min-h-screen bg-white text-gray-900 flex items-center justify-center">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-gray-900 flex flex-col">
      <Toaster
        position="bottom-right"
        icons={{
          success: null,
          error: null,
          info: null,
          warning: null,
        }}
        toastOptions={{
          unstyled: true,
          duration: 2000,
          classNames: {
            toast:
              "backdrop-blur-sm bg-white/90 border border-gray-100 px-3 py-2 text-xs text-gray-500 shadow-sm rounded-md",
          },
        }}
      />
      <Header
        fileName={document.fileName}
        comments={comments}
        onCopyAll={handleCopyAll}
        onCopyAllRaw={handleCopyAllRaw}
        onExportJson={handleExportJson}
        onReload={reload}
        onEditComment={editComment}
        onDeleteComment={deleteComment}
        onGoToComment={navigateToComment}
        onReanchorComment={startReanchor}
        reanchorMode={reanchorTarget}
      />

      <div
        className={`flex-1 flex gap-4 max-w-7xl mx-auto w-full ${hoveredCommentId ? "has-comment-focus" : ""}`}
      >
        {/* Table of contents - left side */}
        {headings.length > 0 && (
          <aside className="w-48 flex-shrink-0 py-6 pl-6 hidden xl:block">
            <div className="sticky top-64 max-h-[calc(100vh-17rem)] overflow-y-auto">
              <TableOfContents
                headings={headings}
                activeId={activeHeadingId}
                onHeadingClick={scrollToHeading}
              />
            </div>
          </aside>
        )}

        {/* Document content */}
        <div className="flex-1 px-6 py-6">
          <DocumentViewer
            content={document.content}
            type={document.type}
            comments={comments}
            headings={headings}
            pendingSelection={selection ?? undefined}
            onTextSelect={onTextSelect}
            onHighlightPositionsChange={onPositionsChange}
            onHighlightHover={setHoveredCommentId}
          />
        </div>

        {/* Margin notes area */}
        <div className="w-72 flex-shrink-0 py-6 pr-4 relative">
          {/* Comment input or re-anchor confirmation - positioned next to selection */}
          {selection && pendingSelectionTop !== undefined && (
            <div
              className="absolute left-0 right-0 z-10 bg-white"
              style={{ top: pendingSelectionTop }}
            >
              {reanchorTarget !== null ? (
                <div className="border-t border-gray-200 pt-2 pb-3 pl-6">
                  <p className="text-sm text-gray-500 mb-2">
                    Re-anchor to this selection?
                  </p>
                  <p className="font-serif text-sm text-gray-400 italic line-clamp-2 mb-2">
                    "{selection.text}"
                  </p>
                  <div className="flex gap-3 text-sm">
                    <button
                      type="button"
                      onClick={handleConfirmReanchor}
                      className="text-gray-600 hover:text-gray-900"
                    >
                      Confirm
                    </button>
                    <button
                      type="button"
                      onClick={handleCancelReanchor}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <CommentInputArea
                  selectedText={selection.text}
                  onSubmit={handleAddComment}
                  onCancel={clearSelection}
                  onCopyRaw={handleCopySelectionRaw}
                  onCopyForLLM={handleCopySelectionForLLM}
                />
              )}
            </div>
          )}

          {/* Margin notes - positioned relative to highlights */}
          <MarginNotesContainer
            sortedComments={sortedComments}
            highlightPositions={highlightPositions}
            pendingSelectionTop={selection ? pendingSelectionTop : undefined}
            hoveredCommentId={hoveredCommentId}
            onEditComment={editComment}
            onDeleteComment={deleteComment}
            onCopyCommentRaw={handleCopyCommentRaw}
            onCopyCommentForLLM={handleCopyCommentForLLM}
            onHoverComment={setHoveredCommentId}
          />
        </div>
      </div>

      {/* Comment minimap - fixed on right edge */}
      <CommentMinimap
        sortedComments={sortedComments}
        documentPositions={documentPositions}
        documentHeight={scrollMetrics.documentHeight}
        viewportHeight={scrollMetrics.viewportHeight}
        hoveredCommentId={hoveredCommentId}
        onCommentClick={navigateToComment}
      />

      {/* Comment navigator - floating bottom-center */}
      <CommentNavigator
        currentIndex={currentIndex}
        totalComments={sortedComments.length}
        onPrevious={navigatePrevious}
        onNext={navigateNext}
      />

      <footer className="py-4 text-center text-sm text-gray-400">
        Made with ❤️ by Jay and Claude
      </footer>
    </div>
  );
}

export default App;
