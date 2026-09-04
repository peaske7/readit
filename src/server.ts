import { getShiki } from "./lib/markdown-renderer.js";
import { disposeMermaidWorker } from "./lib/mermaid-renderer.js";
import { writeServerInfo } from "./lib/readit-home.js";
import { createFetchHandler } from "./server/http.js";
import { DocumentSession, type FileEntry } from "./server/session.js";
import { spawnViteDev } from "./server/vite-dev.js";

export type { FileEntry };

function isErrnoException(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && "code" in err;
}

export interface ServerOptions {
  files: FileEntry[];
  port: number;
  host: string;
  clean?: boolean;
}

export interface ServerResult {
  port: number;
  url: string;
  server: { stop(): void };
}

const MAX_PORT = 65535;

/**
 * Serves the open documents over HTTP, moving to the next port when one is
 * busy. The document state lives in `DocumentSession`; `Bun.serve` only
 * carries requests to it.
 */
export async function startServer(
  options: ServerOptions,
): Promise<ServerResult> {
  getShiki();

  const isDev = process.env.NODE_ENV === "development";
  const session = new DocumentSession({
    files: options.files,
    clean: options.clean,
  });
  const fetch = createFetchHandler({
    session,
    assetsDir: import.meta.dir,
    isDev,
    clean: options.clean,
    onIdleShutdown: isDev
      ? undefined
      : () => {
          console.log("\nBrowser disconnected, shutting down...");
          process.exit(0);
        },
  });

  for (let port = options.port; port <= MAX_PORT; port++) {
    try {
      const server = Bun.serve({
        port,
        hostname: options.host,
        idleTimeout: 255,
        fetch,
      });

      const stopVite = isDev ? await spawnViteDev() : undefined;
      const stopServer = server.stop.bind(server);
      const actualPort = server.port ?? port;

      await writeServerInfo({
        port: actualPort,
        pid: process.pid,
        host: options.host,
      });

      const displayHost =
        options.host === "0.0.0.0" ? "localhost" : options.host;

      return {
        port: actualPort,
        url: `http://${displayHost}:${actualPort}`,
        server: {
          stop() {
            disposeMermaidWorker();
            stopVite?.();
            session.close();
            stopServer();
          },
        },
      };
    } catch (err) {
      if (
        isErrnoException(err) &&
        (err.code === "EADDRINUSE" || err.code === "EACCES")
      ) {
        console.log(`Port ${port} is busy, trying ${port + 1}...`);
        continue;
      }
      session.close();
      throw err;
    }
  }

  session.close();
  throw new Error(`No available port found starting from ${options.port}`);
}
