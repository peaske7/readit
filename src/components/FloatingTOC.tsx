import { List } from "lucide-react";
import { useState } from "react";
import type { Heading } from "../hooks/useHeadings";
import { cn } from "../lib/utils";
import { TableOfContents } from "./TableOfContents";

interface FloatingTOCProps {
  headings: Heading[];
  activeId: string | null;
  onHeadingClick: (id: string) => void;
}

export function FloatingTOC({
  headings,
  activeId,
  onHeadingClick,
}: FloatingTOCProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (headings.length === 0) return null;

  return (
    <nav
      className="fixed left-4 top-16 z-40"
      onMouseEnter={() => setIsExpanded(true)}
      onMouseLeave={() => setIsExpanded(false)}
      aria-label="Table of contents"
    >
      {/* Collapsed state: circular button */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className={cn(
          "w-10 h-10 rounded-full bg-white shadow-lg border border-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-all",
          isExpanded && "opacity-0 pointer-events-none",
        )}
        aria-label="Table of Contents"
      >
        <List className="w-5 h-5" />
      </button>

      {/* Expanded state: panel */}
      {isExpanded && (
        <div className="absolute left-0 top-0 w-56 bg-white/95 backdrop-blur-sm rounded-lg shadow-lg border border-gray-100 p-4 floating-toc-panel">
          <div className="max-h-[calc(100vh-8rem)] overflow-y-auto">
            <TableOfContents
              headings={headings}
              activeId={activeId}
              onHeadingClick={(id) => {
                onHeadingClick(id);
                setIsExpanded(false);
              }}
            />
          </div>
        </div>
      )}
    </nav>
  );
}
