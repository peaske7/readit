import { useEffect, useRef, useState } from "react";

interface ScrollMetrics {
  documentHeight: number;
  viewportHeight: number;
}

/**
 * Track viewport dimensions for minimap calculations.
 * Only re-renders when documentHeight or viewportHeight actually change (resize / DOM mutation).
 * Scroll position is NOT tracked here — it caused full-tree re-renders 60×/s.
 */
export function useScrollMetrics(): ScrollMetrics {
  const [metrics, setMetrics] = useState<ScrollMetrics>({
    documentHeight: 0,
    viewportHeight: 0,
  });

  const prevRef = useRef({ documentHeight: 0, viewportHeight: 0 });

  useEffect(() => {
    const updateMetrics = () => {
      const documentHeight = document.body.scrollHeight;
      const viewportHeight = window.innerHeight;
      const prev = prevRef.current;
      if (
        prev.documentHeight === documentHeight &&
        prev.viewportHeight === viewportHeight
      ) {
        return;
      }
      prevRef.current = { documentHeight, viewportHeight };
      setMetrics({ documentHeight, viewportHeight });
    };

    updateMetrics();

    // ResizeObserver catches both window resize and DOM-driven height changes
    const ro = new ResizeObserver(updateMetrics);
    ro.observe(document.body);
    window.addEventListener("resize", updateMetrics);

    return () => {
      ro.disconnect();
      window.removeEventListener("resize", updateMetrics);
    };
  }, []);

  return metrics;
}
