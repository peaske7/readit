import { useEffect, useRef, useState } from "react";

interface ScrollMetrics {
  documentHeight: number;
  viewportHeight: number;
  scrollTop: number;
}

/**
 * Track document scroll and viewport dimensions for minimap calculations.
 * Updates are throttled to once per animation frame to prevent scroll jank.
 */
export function useScrollMetrics(): ScrollMetrics {
  const [metrics, setMetrics] = useState<ScrollMetrics>({
    documentHeight: 0,
    viewportHeight: 0,
    scrollTop: 0,
  });

  const rafIdRef = useRef<number | null>(null);

  useEffect(() => {
    const updateMetrics = () => {
      setMetrics({
        documentHeight: document.body.scrollHeight,
        viewportHeight: window.innerHeight,
        scrollTop: window.scrollY,
      });
    };

    // Throttle scroll updates to once per animation frame
    const handleScroll = () => {
      if (rafIdRef.current !== null) return;
      rafIdRef.current = requestAnimationFrame(() => {
        updateMetrics();
        rafIdRef.current = null;
      });
    };

    // Initial measurement
    updateMetrics();

    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", updateMetrics);

    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", updateMetrics);
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, []);

  return metrics;
}
