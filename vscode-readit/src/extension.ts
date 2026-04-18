import { existsSync } from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import { ServerManager } from "./server-manager";
import { ReaditWebviewProvider } from "./webview-provider";

let serverManager: ServerManager | undefined;
let webviewProvider: ReaditWebviewProvider | undefined;
let outputChannel: vscode.OutputChannel | undefined;

/**
 * Resolves the readit CLI dist/ directory for the mono-repo layout and throws
 * if the built CLI is not available before the extension tries to start it.
 */
function resolveReaditDistDir(extensionPath: string): string {
  const monoRepoDist = path.resolve(extensionPath, "..", "dist");
  if (!existsSync(path.join(monoRepoDist, "index.js"))) {
    throw new Error(
      "Could not find readit/dist/index.js. Build the readit CLI before using the VS Code extension.",
    );
  }
  return monoRepoDist;
}

/**
 * Gets the absolute file path from a command argument or the active editor.
 */
function resolveFilePath(arg?: vscode.Uri): string | undefined {
  // When invoked from explorer context menu or editor title, arg is a Uri
  if (arg instanceof vscode.Uri) {
    return arg.fsPath;
  }

  // Fall back to active editor
  const editor = vscode.window.activeTextEditor;
  if (editor && editor.document.languageId === "markdown") {
    return editor.document.uri.fsPath;
  }

  return undefined;
}

export function activate(context: vscode.ExtensionContext): void {
  outputChannel = vscode.window.createOutputChannel("readit");
  serverManager = new ServerManager(outputChannel);
  webviewProvider = new ReaditWebviewProvider(
    context.extensionUri,
    serverManager,
    outputChannel,
  );

  let readitDistDir: string;
  try {
    readitDistDir = resolveReaditDistDir(context.extensionPath);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    outputChannel.appendLine(message);
    void vscode.window.showErrorMessage(`readit: ${message}`);
    return;
  }

  // readit.openPreview — opens in the active column
  const openPreview = vscode.commands.registerCommand(
    "readit.openPreview",
    async (arg?: vscode.Uri) => {
      const filePath = resolveFilePath(arg);
      if (!filePath) {
        vscode.window.showWarningMessage(
          "readit: No Markdown file is open or selected.",
        );
        return;
      }

      await webviewProvider!.openPreview(
        filePath,
        readitDistDir,
        vscode.ViewColumn.Active,
      );
    },
  );

  // readit.openPreviewToSide — opens beside the current editor
  const openPreviewToSide = vscode.commands.registerCommand(
    "readit.openPreviewToSide",
    async (arg?: vscode.Uri) => {
      const filePath = resolveFilePath(arg);
      if (!filePath) {
        vscode.window.showWarningMessage(
          "readit: No Markdown file is open or selected.",
        );
        return;
      }

      await webviewProvider!.openPreview(
        filePath,
        readitDistDir,
        vscode.ViewColumn.Beside,
      );
    },
  );

  context.subscriptions.push(
    outputChannel,
    serverManager,
    webviewProvider,
    openPreview,
    openPreviewToSide,
  );
}

export function deactivate(): void {
  // Disposables registered on context.subscriptions are cleaned up automatically.
  // Explicit cleanup as a safety net:
  webviewProvider?.dispose();
  serverManager?.dispose();
  outputChannel?.dispose();
}
