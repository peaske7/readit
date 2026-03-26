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
            primaryTextColor: "#3f3f46",
            primaryBorderColor: "#c9a84a",

            // Secondary colors - slate blue
            secondaryColor: "rgba(168, 196, 228, 0.6)",
            secondaryTextColor: "#3f3f46",
            secondaryBorderColor: "#5b7fa8",

            // Tertiary colors - sage green
            tertiaryColor: "rgba(170, 210, 170, 0.6)",
            tertiaryTextColor: "#3f3f46",
            tertiaryBorderColor: "#5a9a62",

            // Background and text
            background: "#ffffff",
            mainBkg: "#ffffff",
            textColor: "#3f3f46",
            lineColor: "#a1a1aa",

            // Gantt-specific
            taskBkgColor: "rgba(245, 222, 160, 0.7)",
            taskTextColor: "#3f3f46",
            taskTextDarkColor: "#3f3f46",
            taskTextOutsideColor: "#3f3f46",
            activeTaskBkgColor: "rgba(228, 195, 110, 0.8)",
            activeTaskBorderColor: "#c9a84a",
            doneTaskBkgColor: "rgba(170, 210, 170, 0.6)",
            doneTaskBorderColor: "#5a9a62",
            critTaskBkgColor: "rgba(225, 180, 185, 0.7)",
            critBorderColor: "#b86b78",
            gridColor: "#e4e4e7",
            todayLineColor: "#b86b78",
            sectionBkgColor: "rgba(250, 250, 250, 0.5)",
            altSectionBkgColor: "rgba(244, 244, 245, 0.5)",
            sectionBkgColor2: "rgba(250, 250, 250, 0.5)",

            // Flowchart/general diagram
            nodeBkg: "rgba(245, 222, 160, 0.6)",
            nodeBorder: "#c9a84a",
            clusterBkg: "rgba(250, 250, 250, 0.8)",
            clusterBorder: "#e4e4e7",

            // Sequence diagram
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

        // securityLevel: "strict" prevents script injection in mermaid output
        const { svg: renderedSvg } = await mermaid.render(
          `mermaid-${id}`,
          code,
        );

        if (!cancelled) {
          setSvg(renderedSvg);
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
