<script lang="ts">
import { onDestroy, onMount, untrack } from "svelte";
import CommentErrorBanner from "./components/CommentErrorBanner.svelte";
import CommentInput from "./components/CommentInput.svelte";
import CommentNav from "./components/CommentNav.svelte";
import CommentPopover from "./components/CommentPopover.svelte";
import ConnectionBanner from "./components/ConnectionBanner.svelte";
import DocumentViewer from "./components/DocumentViewer.svelte";
import FloatingComment from "./components/FloatingComment.svelte";
import Header from "./components/Header.svelte";
import MarginNotesContainer from "./components/MarginNotesContainer.svelte";
import ReanchorConfirm from "./components/ReanchorConfirm.svelte";
import TabBar from "./components/TabBar.svelte";
import TableOfContents from "./components/TableOfContents.svelte";
import Toast from "./components/Toast.svelte";
import { client } from "./lib/client";
import { purgeExpiredDrafts } from "./lib/comment-drafts";
import { extractContext, formatForLLM } from "./lib/context";
import { formatComment, generatePrompt } from "./lib/export";
import { GeometryAttributes } from "./lib/geometry/attributes";
import type { Cluster } from "./lib/geometry/clustering";
import { MARGIN_COLUMN_PADDING_PX } from "./lib/geometry/constants";
import { matchesBinding, ShortcutActions } from "./lib/shortcut-registry";
import type { Comment } from "./schema";
import {
  addComment,
  app,
  bootstrap,
  deleteComment,
  getActiveDocumentState,
  reanchorComment,
  setActiveDocument,
  setCommentsError,
  setPendingSelectionTop,
  setReanchorTarget,
  setSelection,
  startDocumentStream,
  stopDocumentStream,
  toggleTask,
  updateComment,
} from "./stores/app.svelte";
import { startHeartbeat, stopHeartbeat } from "./stores/connection.svelte";
import { t } from "./stores/locale.svelte";
import { shortcutState } from "./stores/shortcuts.svelte";
import { showToast } from "./stores/toast.svelte";
import { setActiveCommentId, ui } from "./stores/ui.svelte";

let activeClusters = $state<Cluster[]>([]);
let activeIndexById = $state<Map<string, number>>(new Map());
let currentIndex = $state(0);
const highlighterMap = new Map<
  string,
  {
    setFocused: (id: string | undefined) => void;
    scrollTo: (id: string) => void;
  }
>();

function clearPendingHighlight() {
  if (typeof CSS !== "undefined" && CSS.highlights) {
    CSS.highlights.delete("pending-selection");
  }
}

function registerHighlighter(
  filePath: string,
  focused: (id: string | undefined) => void,
  scrollTo: (id: string) => void,
) {
  highlighterMap.set(filePath, { setFocused: focused, scrollTo });
}

function unregisterHighlighter(filePath: string) {
  highlighterMap.delete(filePath);
}

function navigateToComment(commentId: string) {
  const active = app.activeDocumentPath;
  const entry = active ? highlighterMap.get(active) : undefined;
  entry?.scrollTo(commentId);
  entry?.setFocused(commentId);
  setActiveCommentId(commentId);
}

function handleClustersChanged(
  filePath: string,
  clusters: Cluster[],
  indexById: Map<string, number>,
) {
  if (filePath !== app.activeDocumentPath) return;
  activeClusters = clusters;
  activeIndexById = indexById;
}

function navigatePrevious(sortedComments: Comment[]) {
  if (sortedComments.length === 0) return;
  currentIndex =
    currentIndex === 0 ? sortedComments.length - 1 : currentIndex - 1;
  navigateToComment(sortedComments[currentIndex].id);
}

function navigateNext(sortedComments: Comment[]) {
  if (sortedComments.length === 0) return;
  currentIndex =
    currentIndex === sortedComments.length - 1 ? 0 : currentIndex + 1;
  navigateToComment(sortedComments[currentIndex].id);
}

function copyComment(comment: Comment) {
  navigator.clipboard.writeText(formatComment(comment));
  showToast(t("toast.copiedComment"));
}

function onTextSelect(
  filePath: string,
  text: string,
  startOffset: number,
  endOffset: number,
  selectionTop: number,
) {
  setActiveCommentId(undefined);
  setSelection({ text, startOffset, endOffset }, filePath);
  setPendingSelectionTop(selectionTop, filePath);
  app.documents.get(filePath)?.geometry.setPendingSelection(selectionTop);
}

function clearSelection(filePath: string) {
  setSelection(null, filePath);
  setPendingSelectionTop(undefined, filePath);
  app.documents.get(filePath)?.geometry.setPendingSelection(undefined);
  clearPendingHighlight();
  window.getSelection()?.removeAllRanges();
}

function handleClickOutside(e: MouseEvent) {
  const target = e.target as HTMLElement;
  if (target.closest(`[${GeometryAttributes.COMMENT_INPUT}]`)) return;

  if (!app.activeDocumentPath) return;
  const docState = app.documents.get(app.activeDocumentPath);
  if (!docState?.selection) return;

  clearSelection(app.activeDocumentPath);
  requestAnimationFrame(() => {
    const sel = window.getSelection();
    if (sel?.isCollapsed) {
      sel.removeAllRanges();
    }
  });
}

function handleCopyAll(filePath: string) {
  const docState = app.documents.get(filePath);
  if (!docState) return;
  navigator.clipboard.writeText(
    generatePrompt(docState.comments, docState.document.fileName),
  );
  showToast(t("toast.copiedAllComments"));
}

async function handleAddComment(
  filePath: string,
  commentText: string,
): Promise<boolean> {
  const docState = app.documents.get(filePath);
  if (!docState?.selection) return false;
  const { text, startOffset, endOffset } = docState.selection;
  const ok = await addComment(
    filePath,
    text,
    commentText,
    startOffset,
    endOffset,
  );
  if (ok) {
    clearSelection(filePath);
  }
  return ok;
}

function handleConfirmReanchor(filePath: string) {
  const docState = app.documents.get(filePath);
  if (!docState?.selection || !docState.reanchorTarget) return;
  const { text, startOffset, endOffset } = docState.selection;
  reanchorComment(
    filePath,
    docState.reanchorTarget.commentId,
    text,
    startOffset,
    endOffset,
  );
  setReanchorTarget(null, filePath);
  clearSelection(filePath);
}

function handleCancelReanchor(filePath: string) {
  setReanchorTarget(null, filePath);
  clearSelection(filePath);
}

function handleHighlightClick(commentId: string) {
  setActiveCommentId(commentId);
}

function scrollToHeading(id: string) {
  const rect = document.getElementById(id)?.getBoundingClientRect();
  if (!rect) return;
  const elementTop = window.scrollY + rect.top;
  const scrollTarget = Math.max(0, elementTop - window.innerHeight * 0.25);
  window.scrollTo({ top: scrollTarget, behavior: "smooth" });
}

function handleKeyDown(event: KeyboardEvent) {
  const target = event.target as HTMLElement;
  const tagName = target.tagName;

  if (
    tagName === "INPUT" ||
    tagName === "TEXTAREA" ||
    target.isContentEditable
  ) {
    return;
  }

  if (event.metaKey) {
    const digit = Number.parseInt(event.key, 10);
    if (digit >= 1 && digit <= 9) {
      if (app.documentOrder.length <= 1) return;
      const targetIndex = Math.min(digit - 1, app.documentOrder.length - 1);
      const targetPath = app.documentOrder[targetIndex];
      if (targetPath) {
        event.preventDefault();
        setActiveDocument(targetPath);
      }
      return;
    }
  }

  const filePath = app.activeDocumentPath;
  if (!filePath) return;

  const docState = app.documents.get(filePath);
  if (!docState) return;

  for (const shortcut of shortcutState.shortcuts) {
    if (!shortcut.enabled) continue;
    if (!matchesBinding(event, shortcut.binding)) continue;

    event.preventDefault();

    switch (shortcut.id) {
      case ShortcutActions.COPY_ALL:
        handleCopyAll(filePath);
        break;
      case ShortcutActions.COPY_ALL_RAW:
        navigator.clipboard.writeText(
          docState.comments.map(formatComment).join("\n\n---\n\n"),
        );
        showToast(t("toast.copiedAllComments"));
        break;
      case ShortcutActions.NAVIGATE_NEXT:
        navigateNext(docState.sortedComments);
        break;
      case ShortcutActions.NAVIGATE_PREVIOUS:
        navigatePrevious(docState.sortedComments);
        break;
      case ShortcutActions.COPY_SELECTION_RAW: {
        const sel = window.getSelection()?.toString();
        if (sel) navigator.clipboard.writeText(sel);
        break;
      }
      case ShortcutActions.COPY_SELECTION_LLM: {
        const sel = docState.selection;
        if (sel) {
          const context = extractContext({
            content: docState.document.html,
            startOffset: sel.startOffset,
            endOffset: sel.endOffset,
          });
          navigator.clipboard.writeText(
            formatForLLM({
              context,
              fileName: docState.document.fileName,
            }),
          );
        }
        break;
      }
      case ShortcutActions.CLEAR_SELECTION:
        clearSelection(filePath);
        break;
    }

    return;
  }
}

$effect(() => {
  const docState = getActiveDocumentState();
  if (!docState) return;
  const max = docState.sortedComments.length - 1;
  if (max >= 0 && untrack(() => currentIndex) > max) {
    currentIndex = max;
  }
});

onMount(() => {
  bootstrap();
  purgeExpiredDrafts();

  startHeartbeat();
  startDocumentStream();

  window.addEventListener("keydown", handleKeyDown);
  document.addEventListener("mousedown", handleClickOutside);
});

onDestroy(() => {
  stopHeartbeat();
  stopDocumentStream();
  window.removeEventListener("keydown", handleKeyDown);
  document.removeEventListener("mousedown", handleClickOutside);

  for (const docState of app.documents.values()) {
    docState.geometry.dispose();
  }
});
</script>

{#if app.loadError}
  <div class="min-h-screen bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 flex items-center justify-center">
    <div class="text-red-600">{app.loadError}</div>
  </div>
{:else if !app.initialized}
  <div class="min-h-screen bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 flex items-center justify-center">
    <div class="text-zinc-500 dark:text-zinc-400">
      {t("app.loading")}
    </div>
  </div>
{:else if app.documentOrder.length === 0}
  <div class="min-h-screen bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 flex flex-col">
    <TabBar />
    <div class="flex-1 flex flex-col items-center justify-center gap-3">
      <p class="text-zinc-400 dark:text-zinc-500 text-sm">
        {t("app.noDocuments")}
      </p>
      <p class="text-zinc-400 dark:text-zinc-500 text-xs">
        {t("app.noDocumentsHintPrefix")}
        {#if t("app.noDocumentsHintPrefix")}{" "}{/if}
        <code class="bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded text-xs">
          readit open &lt;file.md&gt;
        </code>
        {" "}
        {t("app.noDocumentsHintSuffix")}
      </p>
    </div>
  </div>
{:else}
  <TabBar />

  {#each app.documentOrder as filePath (filePath)}
    {@const docState = app.documents.get(filePath)}
    {@const isActive = filePath === app.activeDocumentPath}
    {@const hasContent = !!docState?.document.html}

    {#if hasContent || isActive}
      <div style={isActive ? undefined : "display: none"}>
        {#if !hasContent}
          <div class="min-h-screen bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 flex items-center justify-center">
            <div class="text-zinc-500 dark:text-zinc-400">
              {t("app.loading")}
            </div>
          </div>
        {:else if docState}
          {@const headings = docState.headings}
          {@const comments = docState.comments}
          {@const sortedComments = docState.sortedComments}
          {@const selection = docState.selection}
          {@const pendingSelectionTop = docState.pendingSelectionTop}
          {@const reanchorTarget = docState.reanchorTarget}

          <div class="min-h-screen bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 flex flex-col">
            <Header {filePath} onnavigate={navigateToComment} />

            <CommentErrorBanner
              error={docState.commentsError}
              ondismiss={() => setCommentsError(null, filePath)}
            />

            <div data-reading-frame class="flex-1 flex items-start gap-4 w-full max-w-7xl mx-auto overflow-x-clip">
              {#if headings.length > 0}
                <aside class="w-48 flex-shrink-0 py-6 pl-6 hidden xl:block">
                  <div class="sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto">
                    <TableOfContents
                      {headings}
                      onheadingclick={scrollToHeading}
                    />
                  </div>
                </aside>
              {/if}

              <div class="flex-1 px-6 py-6">
                <DocumentViewer
                  content={docState.document.html}
                  {comments}
                  {isActive}
                  {filePath}
                  onTextSelect={(text, start, end, top) => onTextSelect(filePath, text, start, end, top)}
                  onHighlightClick={handleHighlightClick}
                  onTaskToggle={client.capabilities.patchTask
                    ? (index, checked) => toggleTask(filePath, index, checked)
                    : undefined}
                  onClustersChanged={(clusters, indexById) => handleClustersChanged(filePath, clusters, indexById)}
                  registerHighlighter={(focused, scrollTo) => registerHighlighter(filePath, focused, scrollTo)}
                  unregisterHighlighter={() => unregisterHighlighter(filePath)}
                  geometry={docState.geometry}
                />
              </div>

              <div
                {...{ [GeometryAttributes.MARGIN_COLUMN]: "" }}
                class="w-72 flex-shrink-0 pr-4 relative hidden lg:block"
                style={`padding-block: ${MARGIN_COLUMN_PADDING_PX}px`}
              >
                {#if selection && pendingSelectionTop !== undefined}
                  <div
                    class="absolute left-0 right-0 z-10 bg-white dark:bg-zinc-900"
                    style="top: {pendingSelectionTop}px"
                  >
                    {#if reanchorTarget !== null}
                      <ReanchorConfirm
                        selectionText={selection.text}
                        onconfirm={() => handleConfirmReanchor(filePath)}
                        oncancel={() => handleCancelReanchor(filePath)}
                      />
                    {:else}
                      <CommentInput
                        selectedText={selection.text}
                        {filePath}
                        startOffset={selection.startOffset}
                        endOffset={selection.endOffset}
                        onsubmit={(text) => handleAddComment(filePath, text)}
                        oncancel={() => clearSelection(filePath)}
                      />
                    {/if}
                  </div>
                {/if}

                <MarginNotesContainer
                  clusters={isActive ? activeClusters : []}
                  geometry={docState.geometry}
                />
              </div>
            </div>

            {#if ui.activeCommentId && isActive}
              {@const activeComment = comments.find((c) => c.id === ui.activeCommentId)}
              {@const idx = activeIndexById.get(ui.activeCommentId) ?? 0}
              {#if activeComment}
                <CommentPopover
                  comment={activeComment}
                  index={idx}
                  onedit={(id, text) => updateComment(filePath, id, text)}
                  ondelete={(id) => deleteComment(filePath, id)}
                  oncopy={copyComment}
                />
              {/if}
            {/if}

            {#if selection && pendingSelectionTop !== undefined}
              <div class="fixed bottom-16 left-4 right-4 z-50 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-lg p-4 lg:hidden">
                {#if reanchorTarget !== null}
                  <ReanchorConfirm
                    selectionText={selection.text}
                    onconfirm={() => handleConfirmReanchor(filePath)}
                    oncancel={() => handleCancelReanchor(filePath)}
                  />
                {:else}
                  <CommentInput
                    selectedText={selection.text}
                    {filePath}
                    startOffset={selection.startOffset}
                    endOffset={selection.endOffset}
                    onsubmit={(text) => handleAddComment(filePath, text)}
                    oncancel={() => clearSelection(filePath)}
                  />
                {/if}
              </div>
            {/if}

            {#if ui.activeCommentId}
              {@const activeComment = comments.find((c) => c.id === ui.activeCommentId)}
              {#if activeComment}
                <FloatingComment
                  comment={activeComment}
                  onedit={(id, text) => updateComment(filePath, id, text)}
                  ondelete={(id) => deleteComment(filePath, id)}
                  oncopy={copyComment}
                  onnavigate={navigateToComment}
                />
              {/if}
            {/if}

            <CommentNav
              {sortedComments}
              {currentIndex}
              onprevious={() => navigatePrevious(sortedComments)}
              onnext={() => navigateNext(sortedComments)}
            />

            <footer class="py-4 text-center text-sm text-zinc-400 dark:text-zinc-500">
              {t("app.footer")}
            </footer>
          </div>
        {/if}
      </div>
    {/if}
  {/each}
{/if}

<ConnectionBanner />
<Toast />
