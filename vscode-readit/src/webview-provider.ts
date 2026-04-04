import * as vscode from "vscode";
import type { ServerManager } from "./server-manager";

/**
 * Manages readit webview panels.
 *
 * Each panel contains an iframe pointing at the readit server on 127.0.0.1.
 * This preserves the full interactive experience: SSE live-reload, comment
 * CRUD, keyboard shortcuts, and all Svelte reactivity — without duplicating
 * any rendering logic.
 */
export class ReaditWebviewProvider implements vscode.Disposable {
  private panels = new Map<string, vscode.WebviewPanel>();
  private disposables: vscode.Disposable[] = [];

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly serverManager: ServerManager,
    private readonly outputChannel: vscode.OutputChannel,
  ) {}

  /**
   * Opens (or reveals) a readit preview panel for the given file.
   * @param filePath Absolute path to the markdown file.
   * @param readitDistDir Absolute path to the readit dist/ directory.
   * @param column Which editor column to open the panel in.
   */
  async openPreview(
    filePath: string,
    readitDistDir: string,
    column: vscode.ViewColumn = vscode.ViewColumn.Active,
  ): Promise<void> {
    // If a panel for this file already exists, reveal it
    const existing = this.panels.get(filePath);
    if (existing) {
      existing.reveal(column);
      return;
    }

    // Ensure the server is running with this file loaded
    let port: number;
    try {
      port = await this.serverManager.ensureRunning(filePath, readitDistDir);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage(`readit: ${message}`);
      return;
    }

    const fileName = filePath.split("/").pop() ?? filePath;

    const panel = vscode.window.createWebviewPanel(
      "readitPreview",
      `readit: ${fileName}`,
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [this.extensionUri],
        // Allow the webview to access the local readit server
        portMapping: [
          {
            webviewPort: port,
            extensionHostPort: port,
          },
        ],
      },
    );

    panel.iconPath = vscode.Uri.joinPath(this.extensionUri, "icon.svg");
    panel.webview.html = this.getWebviewContent(port, filePath, panel.webview);

    this.panels.set(filePath, panel);

    // Clean up when the panel is closed
    panel.onDidDispose(
      () => {
        this.panels.delete(filePath);
        // If no panels remain, stop the server
        if (this.panels.size === 0) {
          this.outputChannel.appendLine("Last panel closed, stopping server.");
          this.serverManager.stop();
        }
      },
      null,
      this.disposables,
    );
  }

  /**
   * Generates the HTML content for the webview.
   * Uses an iframe pointing at the local readit server so the full Svelte app
   * runs unmodified — SSE, comments, settings, and all.
   */
  private getWebviewContent(
    port: number,
    _filePath: string,
    webview: vscode.Webview,
  ): string {
    const serverUrl = `http://127.0.0.1:${port}`;
    const nonce = getNonce();

    // The CSP allows framing the local readit server and running inline scripts
    // with a nonce. The iframe approach means all readit functionality works
    // without any modification to the Svelte frontend.
    const csp = [
      `default-src 'none'`,
      `frame-src http://127.0.0.1:${port}`,
      `style-src 'unsafe-inline'`,
      `script-src 'nonce-${nonce}'`,
    ].join("; ");

    // Use the VS Code webview API to properly resolve the resource
    void webview;

    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <title>readit</title>
  <style>
    html, body {
      margin: 0;
      padding: 0;
      width: 100%;
      height: 100%;
      overflow: hidden;
      background: var(--vscode-editor-background, #1e1e1e);
    }
    iframe {
      border: none;
      width: 100%;
      height: 100%;
    }
    .loading {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      height: 100%;
      color: var(--vscode-foreground, #ccc);
      font-family: var(--vscode-font-family, sans-serif);
      font-size: 14px;
    }
    .loading.hidden {
      display: none;
    }
  </style>
</head>
<body>
  <div id="loading" class="loading">Starting readit server...</div>
  <iframe
    id="readit-frame"
    src="${serverUrl}"
    sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
    style="display: none;"
  ></iframe>
  <script nonce="${nonce}">
    const iframe = document.getElementById('readit-frame');
    const loading = document.getElementById('loading');
    iframe.addEventListener('load', () => {
      loading.classList.add('hidden');
      iframe.style.display = 'block';
    });
    // Show iframe after a max timeout even if load event doesn't fire
    setTimeout(() => {
      loading.classList.add('hidden');
      iframe.style.display = 'block';
    }, 10000);
  </script>
</body>
</html>`;
  }

  /** Closes all open panels. */
  closeAll(): void {
    for (const panel of this.panels.values()) {
      panel.dispose();
    }
    this.panels.clear();
  }

  dispose(): void {
    this.closeAll();
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables = [];
  }
}

/** Generate a random nonce for CSP inline script tags. */
function getNonce(): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < 32; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}
