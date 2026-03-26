import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import { resolve } from "node:path";

interface SpawnPerfCliResult {
  url: string;
  process: ChildProcess;
  cleanup: () => Promise<void>;
}

interface SpawnPerfCliOptions {
  port?: number;
}

const CLI_PATH = resolve(import.meta.dirname, "../../../dist/index.js");

/**
 * Start the readit CLI with one or more fixture files for perf testing.
 * Always uses --clean --no-open.
 */
export async function spawnPerfCli(
  fixturePaths: string | string[],
  options: SpawnPerfCliOptions = {},
): Promise<SpawnPerfCliResult> {
  const { port = 4600 } = options;

  const paths = Array.isArray(fixturePaths) ? fixturePaths : [fixturePaths];
  const args = [
    CLI_PATH,
    ...paths,
    "--no-open",
    "--clean",
    "--port",
    String(port),
  ];

  const cliProcess = spawn("bun", args, {
    cwd: resolve(import.meta.dirname, "../../.."),
    stdio: ["pipe", "pipe", "pipe"],
  });

  const url = await waitForServerReady(cliProcess);

  return {
    url,
    process: cliProcess,
    cleanup: async () => {
      cliProcess.kill("SIGTERM");
      await new Promise<void>((resolve) => {
        cliProcess.once("exit", () => resolve());
        setTimeout(resolve, 2000);
      });
    },
  };
}

function waitForServerReady(cliProcess: ChildProcess): Promise<string> {
  return new Promise((resolve, reject) => {
    let output = "";

    const timeout = setTimeout(() => {
      reject(
        new Error(`Server did not start within timeout. Output: ${output}`),
      );
    }, 30_000);

    cliProcess.stdout?.on("data", (data: Buffer) => {
      output += data.toString();

      const urlMatch = output.match(/URL:\s+(http:\/\/[^\s]+)/);
      if (urlMatch) {
        clearTimeout(timeout);
        resolve(urlMatch[1]);
      }
    });

    cliProcess.stderr?.on("data", (data: Buffer) => {
      output += data.toString();
    });

    cliProcess.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    cliProcess.on("exit", (code) => {
      if (code !== 0 && code !== null) {
        clearTimeout(timeout);
        reject(new Error(`CLI exited with code ${code}: ${output}`));
      }
    });
  });
}
