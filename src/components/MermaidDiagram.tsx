import DOMPurify from "dompurify";
import { useEffect, useId, useState } from "react";

interface MermaidDiagramProps {
  code: string;
}

export function MermaidDiagram({ code }: MermaidDiagramProps) {
  const id = useId().replace(/:/g, "-"); // Mermaid IDs can't have colons
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function renderDiagram() {
      try {
        // Lazy load mermaid
        const mermaid = (await import("mermaid")).default;

        mermaid.initialize({
          startOnLoad: false,
          theme: "base",
          securityLevel: "strict",
          fontFamily: "system-ui, -apple-system, sans-serif",
          themeVariables: {
            // Typography
            fontSize: "16px",

            // Primary colors - warm amber (matches app's comment colors)
            primaryColor: "rgba(245, 222, 160, 0.8)",
            primaryTextColor: "#374151",
            primaryBorderColor: "#c9a84a",

            // Secondary colors - slate blue
            secondaryColor: "rgba(168, 196, 228, 0.6)",
            secondaryTextColor: "#374151",
            secondaryBorderColor: "#5b7fa8",

            // Tertiary colors - sage green
            tertiaryColor: "rgba(170, 210, 170, 0.6)",
            tertiaryTextColor: "#374151",
            tertiaryBorderColor: "#5a9a62",

            // Background and text
            background: "#ffffff",
            mainBkg: "#ffffff",
            textColor: "#374151",
            lineColor: "#9ca3af",

            // Gantt-specific
            taskBkgColor: "rgba(245, 222, 160, 0.7)",
            taskTextColor: "#374151",
            taskTextDarkColor: "#374151",
            taskTextOutsideColor: "#374151",
            activeTaskBkgColor: "rgba(228, 195, 110, 0.8)",
            activeTaskBorderColor: "#c9a84a",
            doneTaskBkgColor: "rgba(170, 210, 170, 0.6)",
            doneTaskBorderColor: "#5a9a62",
            critTaskBkgColor: "rgba(225, 180, 185, 0.7)",
            critBorderColor: "#b86b78",
            gridColor: "#e5e7eb",
            todayLineColor: "#b86b78",
            sectionBkgColor: "rgba(249, 250, 251, 0.5)",
            altSectionBkgColor: "rgba(243, 244, 246, 0.5)",
            sectionBkgColor2: "rgba(249, 250, 251, 0.5)",

            // Flowchart/general diagram
            nodeBkg: "rgba(245, 222, 160, 0.6)",
            nodeBorder: "#c9a84a",
            clusterBkg: "rgba(249, 250, 251, 0.8)",
            clusterBorder: "#e5e7eb",

            // Sequence diagram
            actorBkg: "rgba(168, 196, 228, 0.5)",
            actorBorder: "#5b7fa8",
            actorTextColor: "#374151",
            signalColor: "#374151",
            signalTextColor: "#374151",
            noteBkgColor: "rgba(245, 222, 160, 0.5)",
            noteBorderColor: "#c9a84a",
            noteTextColor: "#374151",
          },
        });

        const { svg: rawSvg } = await mermaid.render(`mermaid-${id}`, code);
        // Sanitize SVG output with DOMPurify before storing in state
        const sanitizedSvg = DOMPurify.sanitize(rawSvg, {
          USE_PROFILES: { svg: true },
        });

        if (!cancelled) {
          setSvg(sanitizedSvg);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to render diagram",
          );
        }
      }
    }

    renderDiagram();
    return () => {
      cancelled = true;
    };
  }, [code, id]);

  if (error) {
    return (
      <div className="my-6">
        <div className="text-red-500 text-sm mb-2">Mermaid Error: {error}</div>
        <pre className="bg-zinc-900 p-4 rounded-lg overflow-x-auto text-sm">
          <code>{code}</code>
        </pre>
      </div>
    );
  }

  if (!svg) {
    return (
      <div className="my-6 bg-zinc-900 p-4 rounded-lg text-zinc-400">
        Loading diagram...
      </div>
    );
  }

  return (
    <div
      className="mermaid-container my-6 flex justify-center overflow-x-auto"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: svg is sanitized by DOMPurify
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
