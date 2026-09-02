import type { Env } from "./env";
import { json } from "./http";
import { handlePublish } from "./publish";
import { handleShare } from "./view";

// 22 base64url chars = 128 bits of share id.
const SHARE_PATH = /^\/s\/([A-Za-z0-9_-]{22})(\/.*)?$/;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;

    if (pathname.startsWith("/assets/")) {
      return env.ASSETS.fetch(request);
    }
    if (pathname === "/api/health") {
      return json({ status: "ok" });
    }
    if (pathname === "/api/shares" || pathname.startsWith("/api/shares/")) {
      return handlePublish(request, env, url);
    }

    const match = pathname.match(SHARE_PATH);
    if (match) {
      return handleShare(request, env, url, match[1], match[2] ?? "");
    }

    return new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
