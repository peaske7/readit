import { type ChildProcess, spawn } from "node:child_process";
import * as net from "node:net";
import * as vscode from "vscode";

/**
 * Manages the lifecycle of a readit Bun server process.
 *
 * Spawns `bun dist/index.js <file> --no-open --port <port>` as a child process.
 * Subsequent files are attached via POST /api/documents to the running server.
 * The server is killed when the extension deactivates or the last panel closes.
 */
export class ServerManager implements vscode.Disposable {
  private process: ChildProcess | null = null;
  private port: number | null = null;
  private outputChannel: vscode.OutputChannel;
  private startPromise: Promise<number> | null = null;

  constructor(outputChannel: vscode.OutputChannel) {
    this.outputChannel = outputChannel;
  }

  /** Returns the port of the running server, or null if not started. */
  getPort(): number | null {
    return this.port;
  }

  /** Returns the base URL of the running server. */
  getBaseUrl(): string | null {
    if (this.port === null) return null;
    return `http://127.0.0.1:${this.port}`;
  }

  /** True if the server process is running. */
  isRunning(): boolean {
    return this.process !== null && this.process.exitCode === null;
  }

  /**
   * Ensures the server is running and the given file is loaded.
   * If the server is not started, spawns it with the file.
   * If already running, attaches the file via the HTTP API.
   * Returns the port number.
   */
  async ensureRunning(
    filePath: string,
    readitDistDir: string,
  ): Promise<number> {
    if (this.startPromise) {
      const port = await this.startPromise;
      await this.attachFile(filePath);
      return port;
    }

    if (this.isRunning() && this.port !== null) {
      await this.attachFile(filePath);
      return this.port;
    }

    return this.start(filePath, readitDistDir);
  }

  /**
   * Starts the Bun server process.
   * Resolves with the port once the server is healthy.
   */
  private start(filePath: string, readitDistDir: string): Promise<number> {
    this.startPromise = this.doStart(filePath, readitDistDir);
    return this.startPromise;
  }

  private async doStart(
    filePath: string,
    readitDistDir: string,
  ): Promise<number> {
    const config = vscode.workspace.getConfiguration("readit");
    const bunPath = config.get<string>("bunPath", "bun");
    const configPort = config.get<number>("serverPort", 0);

    const port = configPort > 0 ? configPort : await findFreePort();

    const cliEntry = vscode.Uri.joinPath(
      vscode.Uri.file(readitDistDir),
      "index.js",
    ).fsPath;

    const args = [cliEntry, filePath, "--no-open", "--port", String(port)];

    this.outputChannel.appendLine(
      `Starting readit server: ${bunPath} ${args.join(" ")}`,
    );

    return new Promise<number>((resolve, reject) => {
      const child = spawn(bunPath, args, {
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          ...process.env,
          NODE_ENV: "production",
        },
      });

      this.process = child;

      child.stdout?.on("data", (data: Buffer) => {
        this.outputChannel.appendLine(data.toString().trimEnd());
      });

      child.stderr?.on("data", (data: Buffer) => {
        this.outputChannel.appendLine(`[stderr] ${data.toString().trimEnd()}`);
      });

      child.on("error", (err) => {
        this.outputChannel.appendLine(`Server process error: ${err.message}`);
        this.cleanup();
        reject(
          new Error(
            `Failed to start readit server. Is Bun installed? (${err.message})`,
          ),
        );
      });

      child.on("exit", (code) => {
        this.outputChannel.appendLine(
          `Server process exited with code ${code}`,
        );
        this.cleanup();
      });

      // Poll for server readiness
      const maxWaitMs = 15_000;
      const intervalMs = 200;
      const startTime = Date.now();

      const timer = setInterval(async () => {
        if (Date.now() - startTime > maxWaitMs) {
          clearInterval(timer);
          this.stop();
          reject(new Error("readit server failed to start within 15 seconds"));
          return;
        }

        try {
          const res = await fetch(`http://127.0.0.1:${port}/api/health`);
          if (res.ok) {
            clearInterval(timer);
            this.port = port;
            this.outputChannel.appendLine(`Server ready on port ${port}`);
            resolve(port);
          }
        } catch {
          // Not ready yet, keep polling
        }
      }, intervalMs);
    });
  }

  /**
   * Attaches a file to the running server via POST /api/documents.
   */
  private async attachFile(filePath: string): Promise<void> {
    if (this.port === null) return;

    try {
      const res = await fetch(`http://127.0.0.1:${this.port}/api/documents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: filePath }),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        this.outputChannel.appendLine(
          `Failed to attach file ${filePath}: ${data.error ?? res.statusText}`,
        );
      } else {
        const data = (await res.json()) as {
          status?: string;
          fileName?: string;
        };
        this.outputChannel.appendLine(
          `File ${data.fileName ?? filePath}: ${data.status ?? "attached"}`,
        );
      }
    } catch (err) {
      this.outputChannel.appendLine(
        `Error attaching file: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /** Stops the server process. */
  stop(): void {
    if (this.process) {
      this.outputChannel.appendLine("Stopping readit server...");
      this.process.kill("SIGTERM");

      // Force kill after 3 seconds
      const forceKillTimer = setTimeout(() => {
        if (this.process && this.process.exitCode === null) {
          this.process.kill("SIGKILL");
        }
      }, 3_000);

      this.process.on("exit", () => {
        clearTimeout(forceKillTimer);
      });
    }
    this.cleanup();
  }

  private cleanup(): void {
    this.process = null;
    this.port = null;
    this.startPromise = null;
  }

  dispose(): void {
    this.stop();
  }
}

/** Finds a free TCP port by binding to port 0 and reading the assigned port. */
function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (addr && typeof addr === "object") {
        const port = addr.port;
        server.close(() => resolve(port));
      } else {
        server.close(() => reject(new Error("Could not determine free port")));
      }
    });
    server.on("error", reject);
  });
}
