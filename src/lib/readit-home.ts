import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { type DocumentSettings, FontFamilies } from "../schema.js";

/**
 * Every path under `~/.readit` and the shape of every file stored there.
 * The home directory is overridable with `READIT_HOME` so tests never touch
 * the real one.
 */

const HOME_ENV = "READIT_HOME";
const LOOPBACK_HOST = "127.0.0.1";
const WILDCARD_HOSTS = new Set(["0.0.0.0", "::", "[::]"]);

export type Settings = DocumentSettings;

/** `~/.readit/server.json`: how `readit open` finds a running server. */
export interface ServerInfo {
  port: number;
  pid: number;
  host?: string;
}

export function readitHome(): string {
  const override = process.env[HOME_ENV];
  return override ? path.resolve(override) : path.join(os.homedir(), ".readit");
}

export function commentsDir(): string {
  return path.join(readitHome(), "comments");
}

export function settingsPath(): string {
  return path.join(readitHome(), "settings.json");
}

export function serverInfoPath(): string {
  return path.join(readitHome(), "server.json");
}

export function serverLockPath(): string {
  return path.join(readitHome(), "server.lock");
}

export function welcomePath(): string {
  return path.join(readitHome(), "welcome.md");
}

/** `~/.readit/config.json`: share remote URL and publish token. */
/** Publisher remote stored in config.json: the Worker URL and its bearer token. */
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

export function remoteConfigPath(): string {
  return path.join(readitHome(), "config.json");
}

/** `~/.readit/shares.json`: registry of published shares. */
export function sharesPath(): string {
  return path.join(readitHome(), "shares.json");
}

export async function ensureHome(): Promise<void> {
  await fs.mkdir(readitHome(), { recursive: true });
}

function isErrnoException(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && "code" in err;
}

async function writeAtomic(filePath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp`;
  await fs.writeFile(tempPath, content, "utf-8");
  await fs.rename(tempPath, filePath);
}

export const DEFAULT_SETTINGS: Settings = {
  version: 1,
  fontFamily: FontFamilies.SERIF,
};

export async function readSettings(): Promise<Settings> {
  try {
    const content = await fs.readFile(settingsPath(), "utf-8");
    return JSON.parse(content) as Settings;
  } catch (err) {
    if (isErrnoException(err) && err.code === "ENOENT") {
      return DEFAULT_SETTINGS;
    }
    throw err;
  }
}

export async function writeSettings(settings: Settings): Promise<void> {
  await writeAtomic(settingsPath(), JSON.stringify(settings, null, 2));
}

export async function readServerInfo(): Promise<ServerInfo | undefined> {
  try {
    const content = await fs.readFile(serverInfoPath(), "utf-8");
    return JSON.parse(content) as ServerInfo;
  } catch {
    return undefined;
  }
}

export async function writeServerInfo(info: ServerInfo): Promise<void> {
  await fs.mkdir(readitHome(), { recursive: true });
  await fs.writeFile(serverInfoPath(), JSON.stringify(info), "utf-8");
}

export async function removeServerInfo(): Promise<void> {
  try {
    await fs.unlink(serverInfoPath());
  } catch (err) {
    if (!isErrnoException(err) || err.code !== "ENOENT") {
      console.error("Failed to remove server info:", err);
    }
  }
}

/** The host a client should dial to reach a server that advertised `info`. */
export function serverHost(info: ServerInfo): string {
  if (!info.host || WILDCARD_HOSTS.has(info.host)) {
    return LOOPBACK_HOST;
  }
  return info.host;
}

export function serverUrl(info: ServerInfo): string {
  return `http://${serverHost(info)}:${info.port}`;
}

/**
 * Canonical key for a document: absolute path with symlinks resolved.
 * The Go server does the same with `filepath.Abs` + `filepath.EvalSymlinks`,
 * so both keep comments for the same file in the same place.
 * Rejects (ENOENT) when the file does not exist, like `fs.realpath`.
 */
export async function canonicalizePath(filePath: string): Promise<string> {
  return fs.realpath(path.resolve(filePath));
}
