import { use, useCallback, useEffect } from "react";
import { Toaster } from "sonner";
import { CommentInput } from "./components/comments/CommentInput";
import { CommentMinimap } from "./components/comments/CommentMinimap";
import { CommentNav } from "./components/comments/CommentNav";
import { DocumentViewer } from "./components/DocumentViewer";
import { FloatingTOC } from "./components/FloatingTOC";
import { Header } from "./components/Header";
import { MarginNotes } from "./components/MarginNotes";
import { ReanchorConfirm } from "./components/ReanchorConfirm";
import { TableOfContents } from "./components/TableOfContents";
import { textVariants } from "./components/ui/Text";
import { CommentContext, CommentProvider } from "./contexts/CommentContext";
import { LayoutContext, LayoutProvider } from "./contexts/LayoutContext";
import { useClipboard } from "./hooks/useClipboard";
import { useDocument } from "./hooks/useDocument";
import { useHeadings } from "./hooks/useHeadings";
import { useScrollMetrics } from "./hooks/useScrollMetrics";
import { useScrollSpy } from "./hooks/useScrollSpy";
import { useTextSelection } from "./hooks/useTextSelection";
import { calculateScrollTarget, getElementTopInDocument } from "./lib/scroll";
import { cn } from "./lib/utils";

const TOASTER_ICONS = { success: null, error: null, info: null, warning: null };
const TOASTER_OPTIONS = {
  unstyled: true,
  duration: 2000,
  classNames: {
    toast: cn(
      "backdrop-blur-sm bg-white/90 border border-zinc-100 px-3 py-2 shadow-sm rounded-md",
      textVariants({ variant: "caption" }),
    ),
  },
};

function AppContent() {
  const {
    comments,
    sortedComments,
    addComment,
    reanchorComment,
    reanchorTarget,
    cancelReanchor,
    hoveredCommentId,
    setHoveredCommentId,
  } = use(CommentContext)!;

  const { document, reload } = useDocument();

  const {
    selection,
    highlightPositions,
    documentPositions,
    pendingSelectionTop,
    onTextSelect,
    onPositionsChange,
    clearSelection,
  } = useTextSelection();

  const {
    copyAll,
    copyAllRaw,
    exportJson,
    copySelectionRaw,
    copySelectionForLLM,
  } = useClipboard({
    comments,
    document: document ?? undefined,
    selection: selection ?? undefined,
    clearSelection,
  });

  const scrollMetrics = useScrollMetrics();

  const headings = useHeadings(
    document?.content ?? null,
    document?.type ?? null,
  );
  const activeHeadingId = useScrollSpy(headings.map((h) => h.id));

  const { isFullscreen } = use(LayoutContext)!;

  const scrollToHeading = useCallback(
    (id: string) => {
      let elementRect: DOMRect | undefined;
      let iframeTopOffset: number | undefined;

      if (document?.type === "html") {
        const iframe = window.document.querySelector("iframe");
        const el = iframe?.contentDocument?.getElementById(id);
        if (!el || !iframe) return;
        elementRect = el.getBoundingClientRect();
        iframeTopOffset = iframe.getBoundingClientRect().top;
      } else {
        elementRect = window.document
          .getElementById(id)
          ?.getBoundingClientRect();
      }
      if (!elementRect) return;

      const elementTop = getElementTopInDocument({
        elementRect,
        scrollY: window.scrollY,
        iframeTopOffset,
      });
      const scrollTarget = calculateScrollTarget({
        elementTop,
        viewportHeight: window.innerHeight,
      });
      window.scrollTo({ top: scrollTarget, behavior: "smooth" });
    },
    [document?.type],
  );

  const handleHighlightClick = useCallback((commentId: string) => {
    const marginNote = window.document.querySelector(
      `article[data-comment-id="${commentId}"]`,
    );
    if (marginNote) {
      marginNote.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, []);

  useEffect(() => {
    const eventSource = new EventSource("/api/heartbeat");
    return () => eventSource.close();
  }, []);

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

  const handleCancelReanchor = useCallback(() => {
    cancelReanchor();
    clearSelection();
  }, [cancelReanchor, clearSelection]);

  if (!document) return null;

  return (
    <div className="min-h-screen bg-white text-zinc-900 flex flex-col">
      <Toaster
        position="bottom-right"
        icons={TOASTER_ICONS}
        toastOptions={TOASTER_OPTIONS}
      />
      <Header
        fileName={document.fileName}
        onCopyAll={copyAll}
        onCopyAllRaw={copyAllRaw}
        onExportJson={exportJson}
        onReload={reload}
      />

      <div
        className={`flex-1 flex gap-4 w-full ${!isFullscreen ? "max-w-7xl mx-auto" : ""} ${hoveredCommentId ? "has-comment-focus" : ""}`}
      >
        {!isFullscreen && headings.length > 0 && (
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
        {isFullscreen && (
          <FloatingTOC
            headings={headings}
            activeId={activeHeadingId}
            onHeadingClick={scrollToHeading}
          />
        )}

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
            onHighlightClick={handleHighlightClick}
          />
        </div>

        <div className="w-72 flex-shrink-0 py-6 pr-4 relative">
          {selection && pendingSelectionTop !== undefined && (
            <div
              className="absolute left-0 right-0 z-10 bg-white"
              style={{ top: pendingSelectionTop }}
            >
              {reanchorTarget !== null ? (
                <ReanchorConfirm
                  selectionText={selection.text}
                  onConfirm={handleConfirmReanchor}
                  onCancel={handleCancelReanchor}
                />
              ) : (
                <CommentInput
                  selectedText={selection.text}
                  onSubmit={handleAddComment}
                  onCancel={clearSelection}
                  onCopyRaw={copySelectionRaw}
                  onCopyForLLM={copySelectionForLLM}
                />
              )}
            </div>
          )}

          <MarginNotes
            sortedComments={sortedComments}
            highlightPositions={highlightPositions}
            pendingSelectionTop={selection ? pendingSelectionTop : undefined}
          />
        </div>
      </div>

      <CommentMinimap
        documentPositions={documentPositions}
        documentHeight={scrollMetrics.documentHeight}
        viewportHeight={scrollMetrics.viewportHeight}
      />

      <CommentNav />

      <footer className="py-4 text-center text-sm text-zinc-400">
        Made with ❤️ by Jay and Claude
      </footer>
    </div>
  );
}

function App() {
  const { document, error } = useDocument();

  if (error) {
    return (
      <div className="min-h-screen bg-white text-zinc-900 flex items-center justify-center">
        <div className="text-red-600">{error}</div>
      </div>
    );
  }

  if (!document) {
    return (
      <div className="min-h-screen bg-white text-zinc-900 flex items-center justify-center">
        <div className="text-zinc-500">Loading...</div>
      </div>
    );
  }

  return (
    <LayoutProvider filePath={document.filePath}>
      <CommentProvider
        filePath={document.filePath}
        clean={document.clean}
        documentContent={document.content}
        fileName={document.fileName}
        documentType={document.type}
      >
        <AppContent />
      </CommentProvider>
    </LayoutProvider>
  );
}

export default App;
