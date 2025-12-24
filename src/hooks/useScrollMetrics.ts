import { useEffect, useState } from "react";

interface ScrollMetrics {
  documentHeight: number;
  viewportHeight: number;
  scrollTop: number;
}

/**
 * Track document scroll and viewport dimensions for minimap calculations.
 * Updates on scroll and resize events.
 */
export function useScrollMetrics(): ScrollMetrics {
  const [metrics, setMetrics] = useState<ScrollMetrics>({
    documentHeight: 0,
    viewportHeight: 0,
    scrollTop: 0,
  });

  useEffect(() => {
    const updateMetrics = () => {
      setMetrics({
        documentHeight: document.body.scrollHeight,
        viewportHeight: window.innerHeight,
        scrollTop: window.scrollY,
      });
    };

    // Initial measurement
    updateMetrics();

    window.addEventListener("scroll", updateMetrics);
    window.addEventListener("resize", updateMetrics);

    return () => {
      window.removeEventListener("scroll", updateMetrics);
      window.removeEventListener("resize", updateMetrics);
    };
  }, []);

  return metrics;
}
