import { useEffect, useState } from "react";

/**
 * Hook to track which heading is currently in view
 * Uses IntersectionObserver to detect when headings enter the "active zone"
 */
export function useScrollSpy(headingIds: string[]): string | null {
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    if (headingIds.length === 0) {
      setActiveId(null);
      return;
    }

    // Track visible headings and their positions
    const visibleHeadings = new Map<string, number>();

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = entry.target.id;

          if (entry.isIntersecting) {
            // Store the top position when heading becomes visible
            visibleHeadings.set(id, entry.boundingClientRect.top);
          } else {
            visibleHeadings.delete(id);
          }
        }

        // Find the heading closest to the top of the viewport
        if (visibleHeadings.size > 0) {
          let closestId: string | null = null;
          let closestDistance = Number.POSITIVE_INFINITY;

          for (const [id, top] of visibleHeadings) {
            // Prefer headings that are near the top but still visible
            const distance = Math.abs(top);
            if (distance < closestDistance) {
              closestDistance = distance;
              closestId = id;
            }
          }

          if (closestId) {
            setActiveId(closestId);
          }
        }
      },
      {
        // Observe when headings are in the top 30% of viewport
        rootMargin: "-10% 0px -70% 0px",
        threshold: 0,
      },
    );

    // Observe all headings
    for (const id of headingIds) {
      const element = document.getElementById(id);
      if (element) {
        observer.observe(element);
      }
    }

    // Set initial active heading (first one if none visible)
    if (headingIds.length > 0 && !activeId) {
      setActiveId(headingIds[0]);
    }

    return () => {
      observer.disconnect();
    };
  }, [headingIds, activeId]);

  return activeId;
}
