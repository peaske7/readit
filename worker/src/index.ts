import type { Env } from "./env";
import { json } from "./http";
import { handlePublish } from "./publish";
import { handleShare } from "./view";

// Shares are never listed here; the root only says what this host is.
const LANDING = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex">
  <title>readit</title>
  <style>
    :root { color-scheme: light dark; }
    body { font-family: system-ui, sans-serif; display: grid; place-items: center; min-height: 100vh; margin: 0; background: #fafafa; color: #222; }
    main { text-align: center; line-height: 1.6; }
    h1 { margin: 0; font-size: 1.4rem; }
    p { margin: .5rem 0 0; color: #666; }
    a { color: inherit; }
    @media (prefers-color-scheme: dark) { body { background: #18181b; color: #e4e4e7; } p { color: #a1a1aa; } }
  </style>
</head>
<body>
  <main>
    <h1>📖 readit</h1>
    <p>Documents shared with <a href="https://github.com/peaske7/readit">readit</a> live at links you were given.</p>
  </main>
</body>
</html>`;

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
    if (pathname === "/") {
      return new Response(LANDING, {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
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
