import { useEffect, useRef, useState } from "react";

export function useScrollSpy(
  headingIds: string[],
  enabled = true,
): string | null {
  const [activeId, setActiveId] = useState<string | null>(null);
  const hasSetInitialRef = useRef(false);

  useEffect(() => {
    if (!enabled || headingIds.length === 0) {
      if (headingIds.length === 0) {
        setActiveId(null);
        hasSetInitialRef.current = false;
      }
      return;
    }

    const visibleHeadings = new Map<string, number>();

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = entry.target.id;

          if (entry.isIntersecting) {
            visibleHeadings.set(id, entry.boundingClientRect.top);
          } else {
            visibleHeadings.delete(id);
          }
        }

        if (visibleHeadings.size > 0) {
          let closestId: string | null = null;
          let closestDistance = Number.POSITIVE_INFINITY;

          for (const [id, top] of visibleHeadings) {
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

    // Set initial active heading BEFORE starting observer
    // to prevent flash when observer fires first
    if (!hasSetInitialRef.current) {
      setActiveId(headingIds[0]);
      hasSetInitialRef.current = true;
    }

    for (const id of headingIds) {
      const element = document.getElementById(id);
      if (element) {
        observer.observe(element);
      }
    }

    return () => {
      observer.disconnect();
    };
  }, [headingIds, enabled]);

  return activeId;
}
