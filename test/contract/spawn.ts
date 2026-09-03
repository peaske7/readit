import { spawn } from "node:child_process";
import { createServer } from "node:net";

export interface ServerProcess {
  /** Tail of stdout+stderr, for error messages when startup fails. */
  output: () => string;
  stop: () => Promise<void>;
}

const OUTPUT_LIMIT = 8_000;

export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.on("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      if (address === null || typeof address === "string") {
        probe.close();
        reject(new Error("Could not read a free port"));
        return;
      }
      const { port } = address;
      probe.close(() => resolve(port));
    });
  });
}

/**
 * Start a server in its own process group so stopping it also stops any child
 * it spawned (wrangler runs workerd underneath).
 */
export function startServerProcess(
  command: string,
  args: string[],
  options: { cwd: string; env: NodeJS.ProcessEnv },
): ServerProcess {
  const child = spawn(command, args, {
    cwd: options.cwd,
    env: options.env,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let output = "";
  const collect = (chunk: Buffer) => {
    output = (output + chunk.toString()).slice(-OUTPUT_LIMIT);
  };
  child.stdout.on("data", collect);
  child.stderr.on("data", collect);

  return {
    output: () => output,
    stop: () =>
      new Promise<void>((resolve) => {
        if (child.exitCode !== null || child.pid === undefined) {
          resolve();
          return;
        }
        const giveUp = setTimeout(resolve, 5_000);
        child.once("exit", () => {
          clearTimeout(giveUp);
          resolve();
        });
        try {
          process.kill(-child.pid, "SIGTERM");
        } catch {
          child.kill("SIGTERM");
        }
      }),
  };
}

export async function waitForOk(
  url: string,
  server: ServerProcess,
  timeoutMs = 60_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  await server.stop();
  throw new Error(
    `${url} did not answer within ${timeoutMs}ms\n${server.output()}`,
  );
}
