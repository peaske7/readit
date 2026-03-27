/**
 * Worker manager for server-side mermaid rendering.
 *
 * Lazily spawns a Bun Worker that runs mermaid inside a JSDOM environment.
 * Handles request correlation, timeouts, and crash recovery.
 */

interface PendingRequest {
  resolve: (svg: string) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

const RENDER_TIMEOUT_MS = 15_000;
const MAX_CONSECUTIVE_ERRORS = 3;

let worker: Worker | null = null;
let workerReady: Promise<void> | null = null;
const pendingRequests = new Map<string, PendingRequest>();
let requestCounter = 0;
let consecutiveErrors = 0;

function createWorker(): { worker: Worker; ready: Promise<void> } {
  const w = new Worker(new URL("./mermaid-worker.ts", import.meta.url).href, {
    type: "module",
  });

  const ready = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Mermaid worker failed to start within 30s"));
    }, 30_000);

    function onReady(event: MessageEvent) {
      if (event.data?.type === "ready") {
        clearTimeout(timeout);
        w.removeEventListener("message", onReady);
        resolve();
      }
    }
    w.addEventListener("message", onReady);
  });

  w.addEventListener("message", (event: MessageEvent) => {
    const { id, svg, error } = event.data;
    if (!id) return;

    const pending = pendingRequests.get(id);
    if (!pending) return;

    clearTimeout(pending.timer);
    pendingRequests.delete(id);

    if (error) {
      consecutiveErrors++;
      pending.reject(new Error(error));
    } else {
      consecutiveErrors = 0;
      pending.resolve(svg);
    }
  });

  w.addEventListener("error", (event) => {
    for (const [, pending] of pendingRequests) {
      clearTimeout(pending.timer);
      pending.reject(new Error(`Worker error: ${event.message}`));
    }
    pendingRequests.clear();
    worker = null;
    workerReady = null;
  });

  return { worker: w, ready };
}

async function ensureWorker(): Promise<Worker> {
  if (worker && workerReady) {
    await workerReady;

    if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
      worker.terminate();
      worker = null;
      workerReady = null;
      consecutiveErrors = 0;
    }
  }

  if (!worker) {
    const result = createWorker();
    worker = result.worker;
    workerReady = result.ready;
    await workerReady;
  }

  return worker;
}

async function renderMermaidSvg(code: string): Promise<string> {
  const w = await ensureWorker();

  const id = `req-${++requestCounter}`;
  const diagramId = `mermaid-ssr-${requestCounter}`;

  return new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingRequests.delete(id);
      reject(
        new Error(`Mermaid render timed out after ${RENDER_TIMEOUT_MS}ms`),
      );
    }, RENDER_TIMEOUT_MS);

    pendingRequests.set(id, { resolve, reject, timer });

    w.postMessage({ id, code, diagramId });
  });
}

/**
 * Render multiple mermaid blocks sequentially.
 * Returns null for blocks that failed (caller should leave them for client fallback).
 */
export async function renderMermaidBlocks(
  blocks: string[],
): Promise<(string | null)[]> {
  const results: (string | null)[] = [];
  for (const code of blocks) {
    try {
      const svg = await renderMermaidSvg(code);
      results.push(svg);
    } catch {
      results.push(null);
    }
  }
  return results;
}

export function disposeMermaidWorker(): void {
  if (worker) {
    worker.terminate();
    worker = null;
    workerReady = null;
    for (const [, pending] of pendingRequests) {
      clearTimeout(pending.timer);
    }
    pendingRequests.clear();
  }
}
