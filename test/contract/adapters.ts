import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { ContractAdapter, ContractServer } from "./contract";
import { ContractRoutes } from "./contract";
import {
  FIXTURE_HEADINGS,
  FIXTURE_HTML,
  FIXTURE_MARKDOWN,
  SECOND_MARKDOWN,
} from "./fixture";
import { freePort, startServerProcess, waitForOk } from "./spawn";

const ROOT = resolve(import.meta.dirname, "../..");
const BUN_CLI = join(ROOT, "dist/index.js");
const GO_BINARY = join(ROOT, "dist/readit");
const WRANGLER = join(ROOT, "node_modules/.bin/wrangler");
const WORKER_DIR = join(ROOT, "worker");

const PUBLISH_TOKEN = "contract-suite-token";

/**
 * A workspace with the fixture documents and its own HOME, so a server under
 * test never reads or writes the developer's ~/.readit.
 */
async function createWorkspace(prefix: string): Promise<{
  home: string;
  documentPath: string;
  secondPath: string;
  remove: () => Promise<void>;
}> {
  const dir = await mkdtemp(join(tmpdir(), `readit-contract-${prefix}-`));
  const home = join(dir, "home");
  await mkdir(home);

  const documentPath = join(dir, "contract.md");
  const secondPath = join(dir, "second.md");
  await writeFile(documentPath, FIXTURE_MARKDOWN, "utf-8");
  await writeFile(secondPath, SECOND_MARKDOWN, "utf-8");

  return {
    home,
    documentPath,
    secondPath,
    remove: () => rm(dir, { recursive: true, force: true }),
  };
}

/** The Bun server, spawned exactly as `bunx readit <file>` does. */
export function bunAdapter(): ContractAdapter {
  if (!existsSync(BUN_CLI)) {
    return {
      name: "bun (dist/index.js)",
      omits: [],
      skipReason: "dist/index.js is missing — run `bun run build`",
    };
  }

  return {
    name: "bun (dist/index.js)",
    omits: [],
    start: () =>
      startLocalServer("bun", (documentPath, port) => [
        "bun",
        [BUN_CLI, documentPath, "--no-open", "--port", String(port)],
      ]),
  };
}

/** The Go binary, which serves the same contract minus `/api/share`. */
export function goAdapter(): ContractAdapter {
  if (!existsSync(GO_BINARY)) {
    return {
      name: "go (dist/readit)",
      omits: [],
      skipReason: "dist/readit is missing — run `make build-server`",
    };
  }

  return {
    name: "go (dist/readit)",
    omits: [],
    start: () =>
      startLocalServer("go", (documentPath, port) => [
        GO_BINARY,
        [documentPath, "--no-open", "--port", String(port)],
      ]),
  };
}

async function startLocalServer(
  prefix: string,
  command: (documentPath: string, port: number) => [string, string[]],
): Promise<ContractServer> {
  const workspace = await createWorkspace(prefix);
  const port = await freePort();
  const [bin, args] = command(workspace.documentPath, port);

  const proc = startServerProcess(bin, args, {
    cwd: ROOT,
    env: { ...process.env, HOME: workspace.home, NODE_ENV: "production" },
  });

  const apiBase = `http://127.0.0.1:${port}`;
  await waitForOk(`${apiBase}/api/health`, proc, 30_000);

  return {
    apiBase,
    addableDocumentPath: workspace.secondPath,
    stop: async () => {
      await proc.stop();
      await workspace.remove();
    },
  };
}

/**
 * The share Worker under `wrangler dev`, with a fixture share published
 * through the publisher API first. R2 is simulated locally and persisted to a
 * throwaway directory, so no Cloudflare account or secret is involved.
 */
export function workerAdapter(): ContractAdapter {
  const omits = [
    ContractRoutes.LIST_DOCUMENTS,
    ContractRoutes.ADD_DOCUMENT,
    ContractRoutes.GET_SETTINGS,
    ContractRoutes.UPDATE_SETTINGS,
    // Health lives at the origin root, not under a share's /api.
    ContractRoutes.HEALTH,
  ];

  if (!existsSync(WRANGLER)) {
    return {
      name: "worker (wrangler dev)",
      omits,
      skipReason: "wrangler is not installed — run `bun install`",
    };
  }
  if (!existsSync(join(WORKER_DIR, "public"))) {
    return {
      name: "worker (wrangler dev)",
      omits,
      skipReason: "worker/public is missing — run `bun run build:worker`",
    };
  }

  return { name: "worker (wrangler dev)", omits, start: startWorker };
}

async function startWorker(): Promise<ContractServer> {
  const stateDir = await mkdtemp(join(tmpdir(), "readit-contract-worker-"));
  const port = await freePort();

  const proc = startServerProcess(
    WRANGLER,
    [
      "dev",
      "--port",
      String(port),
      "--persist-to",
      stateDir,
      "--var",
      `PUBLISH_TOKEN:${PUBLISH_TOKEN}`,
      "--var",
      "COOKIE_SECRET:contract-suite-secret",
    ],
    {
      cwd: WORKER_DIR,
      env: { ...process.env, CI: "1", WRANGLER_SEND_METRICS: "false" },
    },
  );

  const origin = `http://127.0.0.1:${port}`;
  await waitForOk(`${origin}/api/health`, proc, 90_000);

  const shareId = await publishFixtureShare(origin);

  return {
    apiBase: `${origin}/s/${shareId}`,
    stop: async () => {
      await proc.stop();
      await rm(stateDir, { recursive: true, force: true });
    },
  };
}

async function publishFixtureShare(origin: string): Promise<string> {
  const headers = {
    authorization: `Bearer ${PUBLISH_TOKEN}`,
    "content-type": "application/json",
  };

  const created = await fetch(`${origin}/api/shares`, {
    method: "POST",
    headers,
    body: JSON.stringify({ fileName: "contract.md" }),
  });
  if (created.status !== 201) {
    throw new Error(`Could not create a share: ${created.status}`);
  }
  const { id } = (await created.json()) as { id: string };

  const published = await fetch(`${origin}/api/shares/${id}`, {
    method: "PUT",
    headers,
    body: JSON.stringify({
      fileName: "contract.md",
      hash: "contract",
      html: FIXTURE_HTML,
      source: FIXTURE_MARKDOWN,
      headings: FIXTURE_HEADINGS,
    }),
  });
  if (!published.ok) {
    throw new Error(`Could not publish the share: ${published.status}`);
  }

  return id;
}
