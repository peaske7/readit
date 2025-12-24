import { MoreHorizontal } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "../lib/utils";
import type { Comment } from "../types";
import { CommentManagerDropdown } from "./CommentManagerDropdown";
import { RawCommentsModal } from "./RawCommentsModal";

interface HeaderProps {
  fileName: string;
  comments: Comment[];
  onCopyAll: () => void;
  onExportJson: () => void;
  onReload: () => void;
  onEditComment: (id: string, newText: string) => void;
  onDeleteComment: (id: string) => void;
  onGoToComment: (id: string) => void;
  onReanchorComment?: (id: string) => void;
  reanchorMode?: { commentId: string } | null;
}

export function Header({
  fileName,
  comments,
  onCopyAll,
  onExportJson,
  onReload,
  onEditComment,
  onDeleteComment,
  onGoToComment,
  onReanchorComment,
  reanchorMode,
}: HeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [rawModalOpen, setRawModalOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const commentsRef = useRef<HTMLDivElement>(null);

  const commentCount = comments.length;

  // Close dropdowns when clicking outside or pressing Escape
  useEffect(() => {
    if (!menuOpen && !commentsOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
      if (
        commentsRef.current &&
        !commentsRef.current.contains(e.target as Node)
      ) {
        setCommentsOpen(false);
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenuOpen(false);
        setCommentsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [menuOpen, commentsOpen]);

  return (
    <>
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-sm border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
          {/* Left: Brand + filename */}
          <div className="flex items-center gap-3">
            <h1 className="font-serif text-lg tracking-tight text-gray-900">
              readit
            </h1>
            <span className="text-gray-200 font-light">—</span>
            <span className="font-serif text-gray-400 text-sm truncate max-w-[200px]">
              {fileName}
            </span>
          </div>

          {/* Right: Re-anchor indicator + Comment badge + Menu */}
          <div className="flex items-center gap-3">
            {/* Re-anchor mode indicator */}
            {reanchorMode && (
              <span className="text-xs text-gray-400 italic">
                Select text to re-anchor
              </span>
            )}

            {/* Comment badge - clickable to open manager */}
            {commentCount > 0 && (
              <div className="relative" ref={commentsRef}>
                <button
                  type="button"
                  onClick={() => setCommentsOpen(!commentsOpen)}
                  className={cn(
                    "inline-flex items-center gap-1 text-xs tabular-nums select-none transition-colors",
                    commentsOpen
                      ? "text-gray-600"
                      : "text-gray-400 hover:text-gray-600",
                  )}
                  title={`${commentCount} comment${commentCount !== 1 ? "s" : ""}`}
                >
                  <span className="text-gray-300">·</span>
                  {commentCount}
                </button>

                {commentsOpen && (
                  <CommentManagerDropdown
                    comments={comments}
                    onEdit={onEditComment}
                    onDelete={onDeleteComment}
                    onGoTo={onGoToComment}
                    onReanchor={onReanchorComment}
                    onClose={() => setCommentsOpen(false)}
                  />
                )}
              </div>
            )}

            {/* Actions dropdown */}
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setMenuOpen(!menuOpen)}
                className={cn(
                  "p-1.5 rounded-md transition-colors duration-150",
                  menuOpen
                    ? "bg-gray-100 text-gray-600"
                    : "text-gray-300 hover:text-gray-500 hover:bg-gray-50",
                )}
                aria-label="Actions menu"
                aria-expanded={menuOpen}
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>

              {/* Dropdown menu */}
              {menuOpen && (
                <div
                  className="absolute right-0 top-full mt-1 py-1 bg-white rounded-lg shadow-lg shadow-gray-200/50 border border-gray-100 min-w-[140px] animate-in"
                  role="menu"
                >
                  <button
                    type="button"
                    onClick={() => {
                      onReload();
                      setMenuOpen(false);
                    }}
                    className="w-full px-3 py-1.5 text-left text-sm text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors"
                    role="menuitem"
                  >
                    Reload
                  </button>
                  {commentCount > 0 && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          onCopyAll();
                          setMenuOpen(false);
                        }}
                        className="w-full px-3 py-1.5 text-left text-sm text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors"
                        role="menuitem"
                      >
                        Copy All
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onExportJson();
                          setMenuOpen(false);
                        }}
                        className="w-full px-3 py-1.5 text-left text-sm text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors"
                        role="menuitem"
                      >
                        Export JSON
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setRawModalOpen(true);
                          setMenuOpen(false);
                        }}
                        className="w-full px-3 py-1.5 text-left text-sm text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors"
                        role="menuitem"
                      >
                        View Raw
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <RawCommentsModal
        isOpen={rawModalOpen}
        onClose={() => setRawModalOpen(false)}
      />
    </>
  );
}
