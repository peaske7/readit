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

const mermaid = (await import("mermaid")).default;
mermaid.initialize(getMermaidInitConfig());

interface RenderRequest {
  id: string;
  code: string;
  diagramId: string;
}

function resetBody() {
  const body = dom.window.document.body;
  while (body.firstChild) body.removeChild(body.firstChild);
  const container = dom.window.document.createElement("div");
  container.id = "mermaid-container";
  body.appendChild(container);
}

let renderQueue: Promise<void> = Promise.resolve();

self.onmessage = (event: MessageEvent<RenderRequest>) => {
  const { id, code, diagramId } = event.data;

  renderQueue = renderQueue.then(async () => {
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
  });
};

self.postMessage({ type: "ready" });
