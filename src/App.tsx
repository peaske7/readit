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
  useScrollMetrics,
  useScrollSpy,
  useTextSelection,
} from "./hooks";
import { extractContext, formatForLLM } from "./lib/context";
import { exportCommentsAsJson, generatePrompt } from "./lib/export";
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
  } = useComments(document?.filePath || null, { clean: document?.clean });

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

      if (document?.type === "html") {
        const iframe = window.document.querySelector("iframe");
        element = iframe?.contentDocument?.getElementById(id) ?? null;
      } else {
        element = window.document.getElementById(id);
      }

      if (element) {
        element.scrollIntoView({ behavior: "smooth", block: "start" });
      }
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

  // Export handlers
  const handleCopyAll = useCallback(() => {
    if (!document) return;
    const prompt = generatePrompt(comments, document.fileName);
    navigator.clipboard.writeText(prompt);
    toast.success("Copied all comments");
  }, [comments, document]);

  const handleExportJson = useCallback(() => {
    if (!document) return;
    exportCommentsAsJson(comments, document);
  }, [comments, document]);

  // Copy for LLM handlers
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
    toast.success(`Copied: "${truncate(selection.text)}"`);
  }, [selection, document]);

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
      toast.success(`Copied: "${truncate(comment.comment)}"`);
    },
    [document],
  );

  // Keyboard shortcut: Cmd+Shift+C to copy selection for LLM
  useEffect(() => {
    if (!selection) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "c" && e.metaKey && e.shiftKey) {
        e.preventDefault();
        handleCopySelectionForLLM();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selection, handleCopySelectionForLLM]);

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
    <div className="min-h-screen bg-white text-gray-900">
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
        commentCount={comments.length}
        onCopyAll={handleCopyAll}
        onExportJson={handleExportJson}
        onReload={reload}
      />

      <div className="flex gap-4 max-w-7xl mx-auto w-full">
        {/* Table of contents - left side */}
        {headings.length > 0 && (
          <aside className="w-48 flex-shrink-0 py-6 pl-6 hidden xl:block">
            <div className="sticky top-16 max-h-[calc(100vh-5rem)] overflow-y-auto">
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
            pendingSelection={selection ?? undefined}
            onTextSelect={onTextSelect}
            onHighlightPositionsChange={onPositionsChange}
            onHighlightHover={setHoveredCommentId}
          />
        </div>

        {/* Margin notes area */}
        <div className="w-72 flex-shrink-0 py-6 pr-4 relative">
          {/* Comment input - positioned next to selection */}
          {selection && pendingSelectionTop !== null && (
            <div
              className="absolute left-0 right-0 z-10 bg-white"
              style={{ top: pendingSelectionTop }}
            >
              <CommentInputArea
                selectedText={selection.text}
                onSubmit={handleAddComment}
                onCancel={clearSelection}
                onCopyForLLM={handleCopySelectionForLLM}
              />
            </div>
          )}

          {/* Margin notes - positioned relative to highlights */}
          <MarginNotesContainer
            sortedComments={sortedComments}
            highlightPositions={highlightPositions}
            pendingSelectionTop={selection ? pendingSelectionTop : null}
            hoveredCommentId={hoveredCommentId}
            onEditComment={editComment}
            onDeleteComment={deleteComment}
            onCopyCommentForLLM={handleCopyCommentForLLM}
          />
        </div>
      </div>

      {/* Comment minimap - fixed on right edge */}
      <CommentMinimap
        sortedComments={sortedComments}
        documentPositions={documentPositions}
        documentHeight={scrollMetrics.documentHeight}
        viewportHeight={scrollMetrics.viewportHeight}
        scrollTop={scrollMetrics.scrollTop}
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
    </div>
  );
}

export default App;
