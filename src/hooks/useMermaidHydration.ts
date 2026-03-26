import { useEffect, useRef } from "react";

let mermaidIdCounter = 0;

export function useMermaidHydration(
  containerRef: React.RefObject<HTMLElement | null>,
  html: string,
) {
  const prevHtmlRef = useRef("");

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    if (html === prevHtmlRef.current) return;
    prevHtmlRef.current = html;

    const codeBlocks = container.querySelectorAll(
      'pre > code.language-mermaid, pre code[class="language-mermaid"]',
    );
    if (codeBlocks.length === 0) return;

    let cancelled = false;

    async function hydrate() {
      const mermaid = (await import("mermaid")).default;

      mermaid.initialize({
        startOnLoad: false,
        theme: "base",
        securityLevel: "strict",
        fontFamily: "system-ui, -apple-system, sans-serif",
        themeVariables: {
          fontSize: "16px",
          primaryColor: "rgba(245, 222, 160, 0.8)",
          primaryTextColor: "#3f3f46",
          primaryBorderColor: "#c9a84a",
          secondaryColor: "rgba(168, 196, 228, 0.6)",
          secondaryTextColor: "#3f3f46",
          secondaryBorderColor: "#5b7fa8",
          tertiaryColor: "rgba(170, 210, 170, 0.6)",
          tertiaryTextColor: "#3f3f46",
          tertiaryBorderColor: "#5a9a62",
          background: "#ffffff",
          mainBkg: "#ffffff",
          textColor: "#3f3f46",
          lineColor: "#a1a1aa",
          nodeBkg: "rgba(245, 222, 160, 0.6)",
          nodeBorder: "#c9a84a",
          clusterBkg: "rgba(250, 250, 250, 0.8)",
          clusterBorder: "#e4e4e7",
          actorBkg: "rgba(168, 196, 228, 0.5)",
          actorBorder: "#5b7fa8",
          actorTextColor: "#3f3f46",
          signalColor: "#3f3f46",
          signalTextColor: "#3f3f46",
          noteBkgColor: "rgba(245, 222, 160, 0.5)",
          noteBorderColor: "#c9a84a",
          noteTextColor: "#3f3f46",
        },
      });

      for (const codeEl of codeBlocks) {
        if (cancelled) break;

        const code = codeEl.textContent ?? "";
        const preEl = codeEl.parentElement;
        if (!preEl || !code.trim()) continue;

        try {
          const id = `mermaid-hydrate-${mermaidIdCounter++}`;
          const { svg } = await mermaid.render(id, code);

          if (!cancelled && preEl.parentNode) {
            const wrapper = document.createElement("div");
            wrapper.className = "mermaid-container";
            wrapper.innerHTML = svg;
            preEl.replaceWith(wrapper);
          }
        } catch {}
      }
    }

    hydrate();

    return () => {
      cancelled = true;
    };
  }, [containerRef, html]);
}
