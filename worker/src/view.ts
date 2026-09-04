import { type ShareMeta, sharePath } from "../../src/lib/share-snapshot";
import { ShareModes } from "../../src/schema";
import {
  hasValidUnlock,
  unlockCookieHeader,
  unlockCookieValue,
  verifyPassword,
} from "./auth";
import { handleShareComments } from "./comments";
import type { Env } from "./env";
import { errorResponse } from "./http";
import { renderSharePage, renderUnlockPage } from "./page";
import { assetKey, readMeta, readSnapshot } from "./store";

const NO_STORE = "no-store";
// Public pages may sit in Cloudflare's cache for a minute; browsers revalidate.
const PUBLIC_CACHE = "public, max-age=0, s-maxage=60";

/**
 * Viewer routes under /s/{id}. Password shares gate everything except the
 * unlock form behind the HMAC cookie.
 */
export async function handleShare(
  request: Request,
  env: Env,
  url: URL,
  id: string,
  rest: string,
): Promise<Response> {
  const meta = await readMeta(env.SHARES, id);
  if (!meta) return new Response("Not found", { status: 404 });

  if (rest === "/unlock" && request.method === "POST") {
    return unlock(request, env, meta);
  }

  const isPage = rest === "" || rest === "/";

  if (
    meta.mode === ShareModes.PASSWORD &&
    !(await hasValidUnlock(request, env, meta))
  ) {
    if (isPage) {
      return html(
        renderUnlockPage(id, url.searchParams.has("failed")),
        401,
        meta,
      );
    }
    return errorResponse("Locked", 401);
  }

  if (isPage) {
    const snapshot = await readSnapshot(env.SHARES, id);
    if (!snapshot) {
      return new Response("Share has no content yet", { status: 404 });
    }
    return html(renderSharePage(meta, snapshot), 200, meta);
  }

  if (rest.startsWith("/assets/")) {
    const obj = await env.SHARES.get(
      assetKey(id, rest.slice("/assets/".length)),
    );
    if (!obj) return new Response("Not found", { status: 404 });
    return new Response(obj.body, {
      headers: {
        "content-type":
          obj.httpMetadata?.contentType ?? "application/octet-stream",
        // Content-addressed names never change meaning, but a password
        // share's assets must not outlive the unlock in a browser cache.
        "cache-control":
          meta.mode === ShareModes.PASSWORD
            ? NO_STORE
            : "private, max-age=31536000, immutable",
      },
    });
  }

  if (rest.startsWith("/api/")) {
    const res = await handleShareComments(
      request,
      env,
      meta,
      rest.slice("/api".length),
    );
    res.headers.set("cache-control", NO_STORE);
    return res;
  }

  return new Response("Not found", { status: 404 });
}

async function unlock(
  request: Request,
  env: Env,
  meta: ShareMeta,
): Promise<Response> {
  const pageUrl = new URL(sharePath(meta.id), request.url);
  if (meta.mode !== ShareModes.PASSWORD || !meta.password) {
    return Response.redirect(pageUrl.toString(), 303);
  }

  const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
  const { success } = await env.UNLOCK_LIMITER.limit({
    key: `${meta.id}:${ip}`,
  });
  if (!success) {
    return errorResponse("Too many attempts, wait a minute", 429);
  }

  const form = await request.formData();
  const password = String(form.get("password") ?? "");
  const ok =
    password.length > 0 && (await verifyPassword(password, meta.password));
  if (!ok) pageUrl.searchParams.set("failed", "1");

  const headers = new Headers({ location: pageUrl.toString() });
  if (ok) {
    headers.set(
      "set-cookie",
      unlockCookieHeader(meta.id, await unlockCookieValue(env, meta)),
    );
  }
  return new Response(null, { status: 303, headers });
}

function html(body: string, status: number, meta: ShareMeta): Response {
  const headers: Record<string, string> = {
    "content-type": "text/html; charset=utf-8",
    "cache-control": meta.mode === ShareModes.PUBLIC ? PUBLIC_CACHE : NO_STORE,
  };
  if (meta.mode !== ShareModes.PUBLIC) headers["x-robots-tag"] = "noindex";
  return new Response(body, { status, headers });
}
