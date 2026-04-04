import * as path from "node:path";
import * as vscode from "vscode";
import { ServerManager } from "./server-manager";
import { ReaditWebviewProvider } from "./webview-provider";

let serverManager: ServerManager | undefined;
let webviewProvider: ReaditWebviewProvider | undefined;
let outputChannel: vscode.OutputChannel | undefined;

/**
 * Resolves the readit dist/ directory.
 *
 * Strategy:
 * 1. Look for the dist/ directory in the parent readit repo (mono-repo layout).
 *    This is the expected structure when vscode-readit lives inside the readit repo.
 * 2. Fall back to a globally installed @peaske7/readit package.
 */
function resolveReaditDistDir(extensionPath: string): string {
  // Mono-repo: extension is at <repo>/vscode-readit, dist is at <repo>/dist
  const monoRepoDist = path.resolve(extensionPath, "..", "dist");
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

  const readitDistDir = resolveReaditDistDir(context.extensionPath);

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
