import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import pkg from "../package.json" with { type: "json" };
import { isMarkdownFile } from "./lib/utils.js";

const OPEN_PREVIEW_COMMAND = "readit.openPreview";
const OPEN_PREVIEW_IN_BROWSER_COMMAND = "readit.openPreviewInBrowser";

type JsonRpcId = number | string | null;

interface JsonRpcMessage {
  id?: JsonRpcId;
  method?: string;
  params?: unknown;
}

interface CodeAction {
  title: string;
  kind: string;
  command: {
    title: string;
    command: string;
    arguments: string[];
  };
}

interface ExecuteCommandParams {
  command?: unknown;
  arguments?: unknown[];
}

interface TextDocumentParams {
  textDocument?: {
    uri?: unknown;
  };
}

const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;
const INTERNAL_ERROR = -32603;

export function filePathFromUri(uri: string): string | null {
  if (!uri.startsWith("file://")) return null;

  try {
    return fileURLToPath(uri);
  } catch {
    return null;
  }
}

export function isMarkdownUri(uri: string): boolean {
  const filePath = filePathFromUri(uri);
  return filePath !== null && isMarkdownFile(filePath);
}

function hasId(message: JsonRpcMessage): message is JsonRpcMessage & {
  id: JsonRpcId;
} {
  return Object.hasOwn(message, "id");
}

function send(message: unknown): void {
  const body = JSON.stringify(message);
  process.stdout.write(
    `Content-Length: ${Buffer.byteLength(body, "utf8")}\r\n\r\n${body}`,
  );
}

function sendResponse(id: JsonRpcId, result: unknown): void {
  send({ jsonrpc: "2.0", id, result });
}

function sendError(id: JsonRpcId, code: number, message: string): void {
  send({
    jsonrpc: "2.0",
    id,
    error: { code, message },
  });
}

function getTextDocumentUri(params: unknown): string | null {
  const p = params as TextDocumentParams;
  const uri = p?.textDocument?.uri;
  return typeof uri === "string" ? uri : null;
}

function codeActionsFor(uri: string): CodeAction[] {
  if (!isMarkdownUri(uri)) return [];

  return [
    {
      title: "readit: Open Preview",
      kind: "source",
      command: {
        title: "readit: Open Preview",
        command: OPEN_PREVIEW_COMMAND,
        arguments: [uri],
      },
    },
    {
      title: "readit: Open Preview in Browser",
      kind: "source",
      command: {
        title: "readit: Open Preview in Browser",
        command: OPEN_PREVIEW_IN_BROWSER_COMMAND,
        arguments: [uri],
      },
    },
  ];
}

function cliInvocation(args: string[]): { command: string; args: string[] } {
  if (!process.versions.bun) {
    throw new Error("Bun is required to run readit. Install Bun and retry.");
  }

  const entrypoint = process.argv[1];
  if (!entrypoint) {
    throw new Error("readit CLI entrypoint is unavailable");
  }

  return {
    command: process.execPath,
    args: [entrypoint, ...args],
  };
}

async function runReaditZedOpen(filePath: string): Promise<void> {
  const invocation = cliInvocation(["zed-open", filePath]);
  const child = spawn(invocation.command, invocation.args, {
    cwd: process.cwd(),
    env: { ...process.env },
    stdio: ["ignore", "ignore", "pipe"],
  });

  let stderr = "";
  child.stderr?.on("data", (chunk: Buffer) => {
    stderr += chunk.toString("utf8");
  });

  const code = await new Promise<number | null>((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", resolve);
  });

  if (code !== 0) {
    throw new Error(
      stderr.trim() || `readit zed-open exited with status ${code}`,
    );
  }
}

async function executeCommand(params: unknown): Promise<void> {
  const p = params as ExecuteCommandParams;

  if (
    p.command !== OPEN_PREVIEW_COMMAND &&
    p.command !== OPEN_PREVIEW_IN_BROWSER_COMMAND
  ) {
    throw new Error(`unsupported command: ${String(p.command)}`);
  }

  const uri = p.arguments?.[0];
  if (typeof uri !== "string") {
    throw new Error("missing document URI");
  }

  const filePath = filePathFromUri(uri);
  if (!filePath) {
    throw new Error(`unsupported URI: ${uri}`);
  }
  if (!isMarkdownFile(filePath)) {
    throw new Error(`unsupported file type: ${filePath}`);
  }

  await runReaditZedOpen(filePath);
}

async function handleMessage(
  message: JsonRpcMessage,
  state: { shuttingDown: boolean },
): Promise<void> {
  if (typeof message.method !== "string") {
    if (hasId(message)) {
      sendError(message.id, INVALID_PARAMS, "missing method");
    }
    return;
  }

  const requestHasId = hasId(message);

  try {
    switch (message.method) {
      case "initialize":
        if (requestHasId) {
          sendResponse(message.id, {
            capabilities: {
              codeActionProvider: true,
              executeCommandProvider: {
                commands: [
                  OPEN_PREVIEW_COMMAND,
                  OPEN_PREVIEW_IN_BROWSER_COMMAND,
                ],
              },
            },
            serverInfo: {
              name: "readit-zed-lsp",
              version: pkg.version,
            },
          });
        }
        return;

      case "initialized":
        return;

      case "textDocument/codeAction": {
        const uri = getTextDocumentUri(message.params);
        if (requestHasId) {
          sendResponse(message.id, uri ? codeActionsFor(uri) : []);
        }
        return;
      }

      case "workspace/executeCommand":
        await executeCommand(message.params);
        if (requestHasId) {
          sendResponse(message.id, null);
        }
        return;

      case "shutdown":
        state.shuttingDown = true;
        if (requestHasId) {
          sendResponse(message.id, null);
        }
        return;

      case "exit":
        process.exit(state.shuttingDown ? 0 : 1);
        return;

      default:
        if (requestHasId) {
          sendError(
            message.id,
            METHOD_NOT_FOUND,
            `method not found: ${message.method}`,
          );
        }
    }
  } catch (err) {
    if (requestHasId) {
      sendError(
        message.id,
        message.method === "workspace/executeCommand"
          ? INVALID_PARAMS
          : INTERNAL_ERROR,
        err instanceof Error ? err.message : String(err),
      );
    }
  }
}

function processBuffer(
  buffer: Buffer<ArrayBufferLike>,
  onMessage: (message: JsonRpcMessage) => void,
): Buffer<ArrayBufferLike> {
  let remaining = buffer;

  while (true) {
    const headerEnd = remaining.indexOf("\r\n\r\n");
    if (headerEnd === -1) return remaining;

    const header = remaining.subarray(0, headerEnd).toString("ascii");
    const lengthMatch = header.match(/content-length:\s*(\d+)/i);
    if (!lengthMatch) {
      remaining = remaining.subarray(headerEnd + 4);
      continue;
    }

    const contentLength = Number.parseInt(lengthMatch[1], 10);
    const bodyStart = headerEnd + 4;
    const bodyEnd = bodyStart + contentLength;

    if (remaining.length < bodyEnd) return remaining;

    const body = remaining.subarray(bodyStart, bodyEnd).toString("utf8");
    remaining = remaining.subarray(bodyEnd);

    try {
      onMessage(JSON.parse(body) as JsonRpcMessage);
    } catch {
      sendError(null, INVALID_PARAMS, "invalid JSON-RPC payload");
    }
  }
}

export function startZedLspServer(): Promise<void> {
  let buffer: Buffer<ArrayBufferLike> = Buffer.alloc(0);
  const state = { shuttingDown: false };

  return new Promise((resolve) => {
    process.stdin.on("data", (chunk: Buffer) => {
      buffer = processBuffer(Buffer.concat([buffer, chunk]), (message) => {
        void handleMessage(message, state);
      });
    });
    process.stdin.on("end", resolve);
    process.stdin.resume();
  });
}
