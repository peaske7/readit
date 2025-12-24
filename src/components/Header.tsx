import { MoreHorizontal } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "../lib/utils";

interface HeaderProps {
  fileName: string;
  commentCount: number;
  onCopyAll: () => void;
  onExportJson: () => void;
  onReload: () => void;
}

export function Header({
  fileName,
  commentCount,
  onCopyAll,
  onExportJson,
  onReload,
}: HeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside or pressing Escape
  useEffect(() => {
    if (!menuOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [menuOpen]);

  return (
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

        {/* Right: Comment badge + Menu */}
        <div className="flex items-center gap-3">
          {/* Comment badge - minimal dot indicator */}
          {commentCount > 0 && (
            <span
              className="inline-flex items-center gap-1 text-xs text-gray-400 tabular-nums cursor-default select-none"
              title={`${commentCount} comment${commentCount !== 1 ? "s" : ""}`}
            >
              <span className="text-gray-300">·</span>
              {commentCount}
            </span>
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
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
