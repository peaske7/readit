import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import { resolve } from "node:path";

interface SpawnCliResult {
  url: string;
  process: ChildProcess;
  cleanup: () => Promise<void>;
}

interface SpawnCliOptions {
  port?: number;
  clean?: boolean;
}

const CLI_PATH = resolve(import.meta.dirname, "../../dist/index.js");

export async function spawnCli(
  fixturePath: string,
  options: SpawnCliOptions = {},
): Promise<SpawnCliResult> {
  const { port = 4567, clean = true } = options;

  const args = [CLI_PATH, fixturePath, "--no-open", "--port", String(port)];
  if (clean) {
    args.push("--clean");
  }

  const cliProcess = spawn("node", args, {
    cwd: resolve(import.meta.dirname, "../.."),
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
        setTimeout(resolve, 1000); // Fallback timeout
      });
    },
  };
}

function waitForServerReady(cliProcess: ChildProcess): Promise<string> {
  return new Promise((resolve, reject) => {
    let output = "";

    const timeout = setTimeout(() => {
      reject(new Error("Server did not start within timeout"));
    }, 10_000);

    cliProcess.stdout?.on("data", (data: Buffer) => {
      output += data.toString();

      // Look for "URL:  http://..." in output
      const urlMatch = output.match(/URL:\s+(http:\/\/[^\s]+)/);
      if (urlMatch) {
        clearTimeout(timeout);
        resolve(urlMatch[1]);
      }
    });

    cliProcess.stderr?.on("data", (data: Buffer) => {
      console.error("[CLI stderr]", data.toString());
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
