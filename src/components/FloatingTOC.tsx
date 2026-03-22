import { List } from "lucide-react";
import { useState } from "react";
import { useLocale } from "../contexts/LocaleContext";
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
  const { t } = useLocale();
  const [isExpanded, setIsExpanded] = useState(false);

  if (headings.length === 0) return null;

  return (
    <nav
      className="fixed left-4 top-16 z-40"
      onMouseEnter={() => setIsExpanded(true)}
      onMouseLeave={() => setIsExpanded(false)}
      aria-label={t("floatingTOC.label")}
    >
      {/* Collapsed state: circular button */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className={cn(
          "w-10 h-10 rounded-full bg-white dark:bg-zinc-900 shadow-lg border border-zinc-100 dark:border-zinc-800 flex items-center justify-center text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors duration-150",
          isExpanded && "opacity-0 pointer-events-none",
        )}
        aria-label={t("floatingTOC.label")}
      >
        <List className="w-5 h-5" />
      </button>

      {/* Expanded state: panel */}
      {isExpanded && (
        <div className="absolute left-0 top-0 w-56 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-sm rounded-lg shadow-lg border border-zinc-200/40 dark:border-zinc-700/40 p-4 floating-toc-panel">
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
