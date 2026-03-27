/**
 * Bun Worker that renders mermaid diagrams to SVG using JSDOM.
 *
 * JSDOM globals must be set BEFORE importing mermaid because D3
 * reads `document` at module evaluation time.
 */

/// <reference lib="webworker" />

import { JSDOM } from "jsdom";
import { getMermaidInitConfig } from "./mermaid-config";

const dom = new JSDOM(
  '<!DOCTYPE html><html><body><div id="mermaid-container"></div></body></html>',
  {
    url: "http://localhost",
    pretendToBeVisual: true,
    contentType: "text/html",
  },
);

const g = globalThis as Record<string, unknown>;
g.window = dom.window;
g.document = dom.window.document;
g.navigator = dom.window.navigator;
g.DOMParser = dom.window.DOMParser;
g.XMLSerializer = dom.window.XMLSerializer;
g.HTMLElement = dom.window.HTMLElement;
g.SVGElement = (dom.window as unknown as Record<string, unknown>).SVGElement;

// Import mermaid AFTER globals are established
const mermaid = (await import("mermaid")).default;
mermaid.initialize(getMermaidInitConfig());

interface RenderRequest {
  id: string;
  code: string;
  diagramId: string;
}

/**
 * Reset the JSDOM body between renders.
 * Safe: this is a server-side JSDOM instance, not a browser DOM.
 * The content is a static scaffold for mermaid's rendering scratch space.
 */
function resetBody() {
  const body = dom.window.document.body;
  while (body.firstChild) body.removeChild(body.firstChild);
  const container = dom.window.document.createElement("div");
  container.id = "mermaid-container";
  body.appendChild(container);
}

self.onmessage = async (event: MessageEvent<RenderRequest>) => {
  const { id, code, diagramId } = event.data;

  try {
    resetBody();
    const { svg } = await mermaid.render(diagramId, code);
    self.postMessage({ id, svg });
  } catch (err) {
    self.postMessage({
      id,
      error: err instanceof Error ? err.message : String(err),
    });
  }
};

self.postMessage({ type: "ready" });
