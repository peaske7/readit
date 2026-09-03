import { env } from "cloudflare:test";
import { type ShareMode, ShareModes } from "../../src/schema";
import type { Env } from "../src/env";
import worker from "../src/index";

/**
 * The bindings these tests do not exercise: static assets are a build output,
 * and the rate limiter only guards unlock attempts.
 */
const testEnv: Env = {
  ...env,
  ASSETS: {
    fetch: async () => new Response("bundle", { status: 200 }),
  } as unknown as Fetcher,
  UNLOCK_LIMITER: { limit: async () => ({ success: true }) },
};

export const ORIGIN = "https://share.test";
export const PUBLISHER = { authorization: `Bearer ${env.PUBLISH_TOKEN}` };

export function fetchWorker(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  return worker.fetch(new Request(`${ORIGIN}${path}`, init), testEnv);
}

export const SOURCE = "# Title\n\nHello world\n";
export const HTML = "<h1>Title</h1>\n<p>Hello world</p>";

export async function createShare(
  options: { mode?: ShareMode; password?: string; fileName?: string } = {},
): Promise<string> {
  const res = await fetchWorker("/api/shares", {
    method: "POST",
    headers: { ...PUBLISHER, "content-type": "application/json" },
    body: JSON.stringify({
      fileName: options.fileName ?? "notes.md",
      mode: options.mode ?? ShareModes.LINK,
      password: options.password,
    }),
  });
  if (res.status !== 201) throw new Error(`create failed: ${res.status}`);
  const { id } = (await res.json()) as { id: string };
  return id;
}

export function putSnapshot(
  id: string,
  body: Record<string, unknown> = {},
): Promise<Response> {
  return fetchWorker(`/api/shares/${id}`, {
    method: "PUT",
    headers: { ...PUBLISHER, "content-type": "application/json" },
    body: JSON.stringify({
      fileName: "notes.md",
      hash: "0123456789abcdef",
      html: HTML,
      source: SOURCE,
      headings: [{ id: "title", text: "Title", level: 1 }],
      ...body,
    }),
  });
}

/** A share with content, ready for the viewer routes. */
export async function publishShare(
  options: { mode?: ShareMode; password?: string } = {},
): Promise<string> {
  const id = await createShare(options);
  const res = await putSnapshot(id, {
    mode: options.mode,
    password: options.password,
  });
  if (!res.ok) throw new Error(`publish failed: ${res.status}`);
  return id;
}
