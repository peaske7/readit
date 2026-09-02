import { hashPassword, isPublisher } from "./auth";
import type { Env } from "./env";
import { errorResponse, errorWithDetail, json } from "./http";
import {
  assetKey,
  deleteShare,
  isShareMode,
  listShares,
  newShareId,
  type PasswordRecord,
  readComments,
  readMeta,
  type ShareMeta,
  type ShareMode,
  ShareModes,
  writeMeta,
  writeSnapshot,
} from "./store";

/** sha256 prefix + extension, as produced by the CLI's image upload. */
const ASSET_NAME = /^[a-f0-9]{16}\.[a-z0-9]{1,5}$/;
const MAX_ASSET_BYTES = 10 * 1024 * 1024;

/**
 * Publisher API under /api/shares. Every route requires the bearer token.
 *
 *   GET    /api/shares                      list
 *   POST   /api/shares                      create   {fileName, mode?, password?}
 *   PUT    /api/shares/{id}                 replace snapshot
 *   PATCH  /api/shares/{id}                 change mode/password
 *   DELETE /api/shares/{id}                 delete everything under the id
 *   GET    /api/shares/{id}/comments        raw comments.md (for readit pull)
 *   HEAD   /api/shares/{id}/assets/{name}   exists?
 *   PUT    /api/shares/{id}/assets/{name}   upload image bytes
 */
export async function handlePublish(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response> {
  if (!(await isPublisher(request, env))) {
    return errorResponse("Unauthorized", 401);
  }

  // ["api", "shares", id?, "assets" | "comments"?, name?]
  const parts = url.pathname.split("/").filter(Boolean);
  const id = parts[2];
  const method = request.method;

  try {
    if (!id) {
      if (method === "GET") {
        const shares = await listShares(env.SHARES);
        return json({
          shares: shares.map(({ id, fileName, mode, updatedAt }) => ({
            id,
            fileName,
            mode,
            updatedAt,
          })),
        });
      }
      if (method === "POST") return createShare(request, env, url);
      return errorResponse("Method not allowed", 405);
    }

    const meta = await readMeta(env.SHARES, id);
    if (!meta) return errorResponse("Share not found", 404);

    if (parts[3] === "assets" && parts[4] && parts.length === 5) {
      return handleAsset(request, env, id, parts[4]);
    }
    if (parts[3] === "comments" && parts.length === 4 && method === "GET") {
      const content = await readComments(env.SHARES, id);
      return new Response(content ?? "", {
        headers: { "content-type": "text/markdown; charset=utf-8" },
      });
    }
    if (parts.length !== 3) return errorResponse("Not found", 404);

    if (method === "PUT") return replaceSnapshot(request, env, meta);
    if (method === "PATCH") return updateAccess(request, env, meta);
    if (method === "DELETE") {
      await deleteShare(env.SHARES, id);
      return json({ success: true });
    }
    return errorResponse("Method not allowed", 405);
  } catch (err) {
    console.error("publish error:", err);
    return errorWithDetail("Publish failed", err);
  }
}

interface AccessBody {
  mode?: unknown;
  password?: unknown;
}

/**
 * Resolve the mode/password pair for a create, replace, or patch. A new
 * password re-hashes; omitting it keeps the existing record; leaving
 * password mode drops it.
 */
async function resolveAccess(
  body: AccessBody,
  current: { mode: ShareMode; password?: PasswordRecord },
): Promise<{ mode: ShareMode; password?: PasswordRecord } | { error: string }> {
  const mode = body.mode ?? current.mode;
  if (!isShareMode(mode)) return { error: "Invalid mode" };
  if (body.password !== undefined && typeof body.password !== "string") {
    return { error: "Invalid password" };
  }
  if (mode !== ShareModes.PASSWORD) return { mode };

  const password = body.password
    ? await hashPassword(body.password)
    : current.password;
  if (!password) return { error: "password is required" };
  return { mode, password };
}

async function createShare(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response> {
  const body = (await request.json()) as AccessBody & { fileName?: unknown };
  if (typeof body.fileName !== "string" || !body.fileName) {
    return errorResponse("fileName is required", 400);
  }
  const access = await resolveAccess(body, { mode: ShareModes.LINK });
  if ("error" in access) return errorResponse(access.error, 400);

  const now = new Date().toISOString();
  const meta: ShareMeta = {
    id: newShareId(),
    fileName: body.fileName,
    hash: "",
    ...access,
    headings: [],
    createdAt: now,
    updatedAt: now,
  };
  await writeMeta(env.SHARES, meta);
  return json({ id: meta.id, url: `${url.origin}/s/${meta.id}` }, 201);
}

async function replaceSnapshot(
  request: Request,
  env: Env,
  meta: ShareMeta,
): Promise<Response> {
  const body = (await request.json()) as AccessBody & {
    fileName?: unknown;
    hash?: unknown;
    html?: unknown;
    source?: unknown;
    comments?: unknown;
    headings?: unknown;
  };
  if (
    typeof body.html !== "string" ||
    typeof body.source !== "string" ||
    typeof body.hash !== "string"
  ) {
    return errorResponse("html, source, and hash are required", 400);
  }
  if (body.comments !== undefined && typeof body.comments !== "string") {
    return errorResponse("comments must be a string", 400);
  }
  const access = await resolveAccess(body, meta);
  if ("error" in access) return errorResponse(access.error, 400);

  await writeSnapshot(env.SHARES, meta.id, {
    html: body.html,
    source: body.source,
    comments: body.comments,
  });
  await writeMeta(env.SHARES, {
    ...meta,
    fileName:
      typeof body.fileName === "string" && body.fileName
        ? body.fileName
        : meta.fileName,
    hash: body.hash,
    headings: Array.isArray(body.headings)
      ? (body.headings as ShareMeta["headings"])
      : [],
    mode: access.mode,
    password: access.password,
    updatedAt: new Date().toISOString(),
  });
  return json({ success: true });
}

async function updateAccess(
  request: Request,
  env: Env,
  meta: ShareMeta,
): Promise<Response> {
  const body = (await request.json()) as AccessBody;
  const access = await resolveAccess(body, meta);
  if ("error" in access) return errorResponse(access.error, 400);

  await writeMeta(env.SHARES, {
    ...meta,
    mode: access.mode,
    password: access.password,
    updatedAt: new Date().toISOString(),
  });
  return json({ success: true });
}

async function handleAsset(
  request: Request,
  env: Env,
  id: string,
  name: string,
): Promise<Response> {
  if (!ASSET_NAME.test(name)) return errorResponse("Invalid asset name", 400);
  const key = assetKey(id, name);

  if (request.method === "HEAD") {
    const head = await env.SHARES.head(key);
    return new Response(null, { status: head ? 200 : 404 });
  }
  if (request.method !== "PUT") {
    return errorResponse("Method not allowed", 405);
  }

  const length = Number(request.headers.get("content-length") ?? "0");
  if (length > MAX_ASSET_BYTES) return errorResponse("Asset too large", 413);

  await env.SHARES.put(key, request.body, {
    httpMetadata: {
      contentType:
        request.headers.get("content-type") ?? "application/octet-stream",
    },
  });
  return json({ success: true });
}
