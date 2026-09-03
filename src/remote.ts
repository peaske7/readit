import * as fs from "node:fs/promises";
import * as readline from "node:readline";
import { ensureHome, remoteConfigPath, sharesPath } from "./lib/readit-home.js";

export interface RemoteConfig {
  url: string;
  token: string;
}

/** One entry per shared local file, keyed by absolute path in shares.json. */
export interface ShareRecord {
  id: string;
  url: string;
  mode: string;
  /** Comment ids present in the last snapshot we pushed; drives merge on pull. */
  publishedIds: string[];
}

export async function loadRemote(): Promise<RemoteConfig> {
  const envUrl = process.env.READIT_REMOTE_URL;
  const envToken = process.env.READIT_TOKEN;
  if (envUrl && envToken) {
    return { url: envUrl.replace(/\/$/, ""), token: envToken };
  }

  try {
    const raw = JSON.parse(await fs.readFile(remoteConfigPath(), "utf-8")) as {
      remote?: RemoteConfig;
    };
    if (raw.remote?.url && raw.remote?.token) {
      return {
        url: raw.remote.url.replace(/\/$/, ""),
        token: raw.remote.token,
      };
    }
  } catch {}
  throw new Error(
    "No remote configured. Run `readit remote setup` or set READIT_REMOTE_URL and READIT_TOKEN.",
  );
}

export async function saveRemote(remote: RemoteConfig): Promise<void> {
  await ensureHome();
  let existing: Record<string, unknown> = {};
  try {
    existing = JSON.parse(await fs.readFile(remoteConfigPath(), "utf-8"));
  } catch {}
  // The file holds the publish token, so keep it owner-readable only.
  await fs.writeFile(
    remoteConfigPath(),
    JSON.stringify({ ...existing, remote }, null, 2),
    {
      mode: 0o600,
    },
  );
  await fs.chmod(remoteConfigPath(), 0o600);
}

/**
 * Ask questions in order. Lines are buffered as they arrive, so this works
 * both interactively and with piped stdin (where every line lands at once).
 */
export async function ask(questions: string[]): Promise<string[]> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: process.stdin.isTTY ?? false,
  });
  const buffered: string[] = [];
  const waiting: ((line: string) => void)[] = [];
  let closed = false;

  rl.on("line", (line) => {
    const resolve = waiting.shift();
    if (resolve) resolve(line);
    else buffered.push(line);
  });
  rl.on("close", () => {
    closed = true;
    for (const resolve of waiting.splice(0)) resolve("");
  });

  const nextLine = () =>
    new Promise<string>((resolve) => {
      const line = buffered.shift();
      if (line !== undefined) return resolve(line);
      if (closed) return resolve("");
      waiting.push(resolve);
    });

  try {
    const answers: string[] = [];
    for (const question of questions) {
      process.stdout.write(question);
      answers.push((await nextLine()).trim());
    }
    return answers;
  } finally {
    rl.close();
  }
}

export async function prompt(question: string): Promise<string> {
  const [answer] = await ask([question]);
  return answer;
}

export async function loadShares(): Promise<Record<string, ShareRecord>> {
  try {
    return JSON.parse(await fs.readFile(sharesPath(), "utf-8"));
  } catch {
    return {};
  }
}

export async function saveShares(
  shares: Record<string, ShareRecord>,
): Promise<void> {
  await ensureHome();
  await fs.writeFile(sharesPath(), JSON.stringify(shares, null, 2));
}

/** Authenticated request to the Worker; throws with the body on non-2xx. */
export async function remoteFetch(
  remote: RemoteConfig,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${remote.token}`);
  const res = await fetch(`${remote.url}${path}`, { ...init, headers });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `${init.method ?? "GET"} ${path} failed (${res.status}): ${detail}`,
    );
  }
  return res;
}
