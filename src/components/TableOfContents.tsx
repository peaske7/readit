import { use, useMemo, useState } from "react";
import { LayoutContext } from "../contexts/LayoutContext";
import type { Heading } from "../hooks/useHeadings";
import { cn } from "../lib/utils";
import { FontFamilies } from "../types";

interface TableOfContentsProps {
  headings: Heading[];
  activeId: string | null;
  onHeadingClick: (id: string) => void;
}

export function TableOfContents({
  headings,
  activeId,
  onHeadingClick,
}: TableOfContentsProps) {
  const layout = use(LayoutContext);
  const fontClass = layout
    ? layout.fontFamily === FontFamilies.SANS_SERIF
      ? "font-sans"
      : "font-serif"
    : undefined;

  const [expandedH2s, setExpandedH2s] = useState<Set<string>>(() => new Set());

  const h2sWithChildren = useMemo(() => {
    const result = new Set<string>();
    let currentH2: string | null = null;

    for (const heading of headings) {
      if (heading.level === 2) {
        currentH2 = heading.id;
      } else if (heading.level > 2 && currentH2) {
        result.add(currentH2);
      } else if (heading.level === 1) {
        currentH2 = null;
      }
    }
    return result;
  }, [headings]);

  const visibleHeadings = useMemo(() => {
    let currentH2: string | null = null;

    return headings.filter((heading) => {
      if (heading.level <= 2) {
        if (heading.level === 2) {
          currentH2 = heading.id;
        } else {
          currentH2 = null;
        }
        return true;
      }

      return currentH2 && expandedH2s.has(currentH2);
    });
  }, [headings, expandedH2s]);

  const toggleH2 = (id: string) => {
    setExpandedH2s((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  if (headings.length === 0) {
    return null;
  }

  return (
    <nav className={cn("toc", fontClass)} aria-label="Table of contents">
      {visibleHeadings.map((heading) => {
        const hasChildren =
          heading.level === 2 && h2sWithChildren.has(heading.id);
        const isExpanded = expandedH2s.has(heading.id);

        return (
          <a
            key={heading.id}
            href={`#${heading.id}`}
            title={heading.text}
            className={`toc-item toc-level-${heading.level}${activeId === heading.id ? " toc-active" : ""}`}
            onClick={(e) => {
              e.preventDefault();
              if (hasChildren) {
                toggleH2(heading.id);
              }
              onHeadingClick(heading.id);
            }}
          >
            {heading.text}
            {hasChildren && (
              <span className="toc-toggle ml-1 opacity-40">
                {isExpanded ? "▾" : "▸"}
              </span>
            )}
          </a>
        );
      })}
    </nav>
  );
}
