# Plan 006: Sanitize rendered HTML once at render time with a real sanitizer, and add response-hardening headers on the Worker

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 6ba758c..HEAD -- src/template.ts src/lib/markdown-renderer.ts src/server.ts src/share.ts worker/src/page.ts worker/src/view.ts worker/src/http.ts worker/src/index.ts src/components/DocumentViewer.svelte package.json`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: 001 (the Worker test harness in `worker/test/` already exists — see plan 004)
- **Category**: security
- **Planned at**: commit `6ba758c`, 2026-09-04
- **Issue**: https://github.com/peaske7/readit/issues/28

## Why this matters

Markdown is rendered with raw HTML enabled, then "sanitized" by four regexes. Two bypasses were reproduced on 2026-09-04 by calling the exported function: `<img src=x/onerror=alert(1)>` and `<a href=javascript:alert(1)>` pass through unchanged, and `<iframe>`/`<object>` elements survive. On a share this is stored XSS against every viewer of `md.peas.ke`, and on the local server it runs in the origin that can read every open document. Worse for correctness: the local server computes comment offsets from the *unsanitized* HTML and then sanitizes the page, so any stripped content shifts every highlight, and `GET /api/document` (used on live reload) plus the Worker's document route return unsanitized HTML straight into `innerHTML`. The Go server already sanitizes at render time with bluemonday, so both Go paths are consistent; this plan makes the TypeScript path match that model. Finally, no response anywhere sets CSP, `X-Content-Type-Options`, or frame headers.

Design constraint from `docs/plans/2026-09-02-share-design.md` §5.7: "XSS via the document — the HTML still goes through the existing sanitizer before publish." This plan keeps that sentence true and makes the sanitizer real.

## Current state

- `src/lib/markdown-renderer.ts:54` — `new MarkdownIt({ html: true, … })`. `renderMarkdown` (lines 225-244) returns `{ html, headings }` after heading ids, mermaid replacement, task-list transform, and frontmatter block.
- `src/template.ts:37-55` — `sanitizeHtml` (four regexes). Line 95 applies it inside `renderTemplate`: `<article id="document-content" …>${sanitizeHtml(documentHtml)}</article>`.
- `src/server.ts:843-845` — `serveAppPage`: `const { html } = await ensureRenderedHtml(activePath); … readCommentsFromFile(activePath, content, html)` → offsets computed against unsanitized `html`; the page then sanitizes.
- `src/server.ts:1157-1163` — `GET /api/document` returns `html` unsanitized.
- `src/components/DocumentViewer.svelte:160` and `:311` — `innerHTML = content` with the comment `trusted server content`.
- `src/share.ts:~66-70` — `uploadImages(remote, record.id, dirname(absPath), sanitizeHtml(rendered.html))` (sanitized before upload — fine, but with the weak sanitizer).
- `worker/src/comments.ts` `GET /document` (~lines 42-49) returns `snapshot.html` (as stored; currently sanitized by the CLI at publish time).
- `worker/src/page.ts` `renderSharePage` passes `snapshot.html` to `renderTemplate` (inline data now comes from `hostedInlineData` in `src/lib/share-snapshot.ts`), which sanitizes again.
- `go/internal/server/markdown.go:40-51` — bluemonday `UGCPolicy()` plus allowances for the classes/attrs readit's enhancers need (read this file to copy the allowlist).
- Theme bootstrap inline script in `src/template.ts:84-90` — a CSP must permit it (nonce or hash) or it must move into the bundle.
- Worker responses: `worker/src/view.ts:121-128` (`html()` sets content-type, cache-control, x-robots-tag), `worker/src/http.ts` (`json`, `errorResponse`), `worker/src/index.ts:41-43` (`/assets/*` → `env.ASSETS.fetch(request)`), landing page.
- Existing tests: `src/lib/markdown-renderer.test.ts` (216 lines; use as the pattern for renderer tests). No test covers `sanitizeHtml`.
- Runtime deps today: `markdown-it`, `shiki`, `mermaid`, `jsdom`, `commander`, `open`, `clsx`, `tailwind-merge`. `jsdom` is already a dependency (used by the mermaid worker), so DOMPurify with a jsdom window is available without a new heavyweight dep; `sanitize-html` is an alternative that needs no DOM. Pick **`sanitize-html`** (no DOM, works in Bun; the Worker never runs the sanitizer because the CLI sanitizes before upload).

Repo conventions: named exports, style guide "parse, don't validate", tests co-located. Commit style `fix(security): …` / `feat(worker): …`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `bun add sanitize-html && bun add -d @types/sanitize-html` | exit 0 |
| Typecheck | `bun run typecheck` | exit 0 |
| Worker typecheck | `bun run build:worker && bun run typecheck:worker` | exit 0 |
| Unit tests | `bun run test` | all pass |
| Worker tests | `bun run test:worker` | all pass (if plan 004 landed) |
| e2e | `bun run test:e2e` | all pass |
| Build | `bun run build` | exit 0 |

## Scope

**In scope**:
- `package.json`, `bun.lock` (add `sanitize-html`)
- `src/lib/sanitize.ts` (create) + `src/lib/sanitize.test.ts` (create)
- `src/lib/markdown-renderer.ts` (call sanitizer at the end of `renderMarkdown`)
- `src/template.ts` (remove `sanitizeHtml`; stop exporting it)
- `src/share.ts` (drop the `sanitizeHtml` call — HTML from `renderMarkdown` is already sanitized)
- `worker/src/page.ts` (no sanitizer call; the Worker never sanitizes)
- `worker/src/http.ts`, `worker/src/view.ts`, `worker/src/index.ts` (security headers)
- `worker/test/headers.test.ts` (create)
- `src/lib/__fixtures__/xss-cases.ts` (create)

**Out of scope**:
- `go/internal/server/*` — already sanitizes at render time. But copy its allowlist so the two agree.
- Changing `html: true` to `false` (removes a documented feature: raw HTML in Markdown; the sanitizer is the chosen control).
- The local Bun server's headers (loopback-only, out of scope here; plan 015 covers its Host check).

## Git workflow

- Branch: `advisor/006-sanitize-once`
- Commits: `fix(security): sanitize rendered HTML once at render time with sanitize-html`, `feat(worker): CSP, nosniff, and frame headers on every response`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Build the allowlist and a fixture of bypass cases

1. Read `go/internal/server/markdown.go:40-51` and list every tag, attribute, and class bluemonday allows beyond `UGCPolicy` (task-list inputs, `data-*` attributes used by `src/components/*Enhancer.svelte`, heading `id`, `mermaid-container` with `data-mermaid-source`, shiki `<span style>`/`class`, table wrappers).
2. Grep the enhancers for the attributes they read: `grep -rn "dataset\.\|data-\|getAttribute(" src/components/*.svelte src/lib/*.ts | grep -v test`. Every attribute found must be in the allowlist.
3. Create `src/lib/__fixtures__/xss-cases.ts` exporting an array of `{ input, mustNotContain }` covering at least: `onerror` with whitespace, `onerror` after `/` with no whitespace, unquoted `javascript:` href, quoted `javascript:` href with mixed case `JaVaScRiPt:`, `<iframe srcdoc=…>`, `<object data=…>`, `<svg><script>`, `<img src="data:text/html,…">`, `<a href="vbscript:…">`, `<style>` block, `<form action>`, and `<meta http-equiv>`.

**Verify**: the fixture file typechecks (`bun run typecheck`).

### Step 2: Write `src/lib/sanitize.ts`

```ts
import sanitizeHtml from "sanitize-html";

const ALLOWED_TAGS = [...sanitizeHtml.defaults.allowedTags, "img", "input", "details", "summary", "svg", /* every SVG element mermaid emits — list them explicitly */];
const options: sanitizeHtml.IOptions = {
  allowedTags: ALLOWED_TAGS,
  allowedAttributes: {
    "*": ["class", "id", "data-*", "style"],      // data-* attributes are read by the Svelte enhancers
    a: ["href", "name", "target", "rel"],
    img: ["src", "alt", "title", "width", "height"],
    input: ["type", "checked", "disabled"],
    // plus every SVG attribute mermaid needs (viewBox, d, transform, fill, stroke, x, y, …)
  },
  allowedSchemes: ["http", "https", "mailto"],
  allowedSchemesByTag: { img: ["http", "https", "data"] },  // data: images only on <img>
  allowedSchemesAppliedToAttributes: ["href", "src"],
  allowProtocolRelative: false,
  disallowedTagsMode: "discard",
  parseStyleAttributes: true,
};

/** Sanitize rendered document HTML. Called exactly once, at the end of renderMarkdown. */
export function sanitizeDocumentHtml(html: string): string {
  return sanitizeHtml(html, options);
}
```
Mermaid SVG: rather than enumerating SVG attributes by hand, render `src/lib/markdown-renderer.test.ts`'s mermaid fixture through the sanitizer and diff the output; iterate the allowlist until the SVG is unchanged. If mermaid output cannot be preserved with a reasonable allowlist, keep `<div class="mermaid-container" data-mermaid-source>` and let the client re-render (it already does when SSR fails: `DocumentViewer.svelte:118-135`), and note this in your report.

Create `src/lib/sanitize.test.ts`: for each fixture case assert `sanitizeDocumentHtml(input)` does not contain `mustNotContain`; plus positive cases: a shiki code block, a task-list `<input type="checkbox" disabled>`, a heading with `id`, a table, and a mermaid container survive byte-for-byte (or with only attribute reordering).

**Verify**: `bun run test -- sanitize` → all pass.

### Step 3: Sanitize at render time, nowhere else

1. In `src/lib/markdown-renderer.ts` `renderMarkdown`, after the frontmatter block is prepended, add `html = sanitizeDocumentHtml(html);` as the last transform, so `state.renderedHtml`, `GET /api/document`, the SSR page, offset resolution, and the share upload all see identical sanitized HTML.
2. In `src/template.ts`, delete `sanitizeHtml` and use `${documentHtml}` directly at line 95. Update the doc comment above `renderTemplate` to say "documentHtml must already be sanitized by renderMarkdown".
3. In `src/share.ts` (~line 69), remove the `sanitizeHtml(...)` wrapper and its import.
4. `worker/src/page.ts` needs no change beyond compiling (it never imported the sanitizer).
5. In `src/components/DocumentViewer.svelte` lines 160 and 311, update the trailing comment to `// sanitized by renderMarkdown on the server`.

**Verify**: `grep -rn "sanitizeHtml" src worker` → no matches. `bun run typecheck && bun run typecheck:worker` → exit 0. `bun run test` → all pass (update any `markdown-renderer.test.ts` expectations that asserted raw dangerous HTML passes through). `bun run test:e2e` → all pass (highlights still land: `e2e/comments.spec.ts`).

### Step 4: Worker security headers

1. In `worker/src/http.ts` add:
   ```ts
   export const SECURITY_HEADERS: Record<string, string> = {
     "x-content-type-options": "nosniff",
     "x-frame-options": "DENY",
     "referrer-policy": "no-referrer",
     "content-security-policy": [
       "default-src 'self'",
       "script-src 'self' 'sha256-<HASH>'",  // hash of the theme bootstrap script in src/template.ts:85-89
       "style-src 'self' 'unsafe-inline'",   // shiki and mermaid emit style attributes
       "img-src 'self' data: https:",
       "connect-src 'self'",
       "frame-ancestors 'none'",
       "base-uri 'none'",
       "form-action 'self'",
     ].join("; "),
   };
   export function withSecurityHeaders(res: Response): Response { const h = new Headers(res.headers); for (const [k, v] of Object.entries(SECURITY_HEADERS)) if (!h.has(k)) h.set(k, v); return new Response(res.body, { status: res.status, headers: h }); }
   ```
   Compute `<HASH>` with `bun -e 'const s=`…exact script body…`; console.log(new Bun.CryptoHasher("sha256").update(s).digest("base64"))'` using the exact text between `<script>` and `</script>` in `src/template.ts` (whitespace-exact). Add a unit test in `src/lib/sanitize.test.ts` or a new `src/template.test.ts` that recomputes the hash from `renderTemplate` output and asserts it equals the constant, so a template edit fails loudly.
2. In `worker/src/index.ts` `fetch`, wrap the final response: compute `const res = await route(...)` and `return withSecurityHeaders(res)` for every branch including `/assets/*` (the Svelte bundle is `self`, fine).
3. Confirm the Svelte bundle has no inline scripts other than the theme bootstrap and the JSON data block (`<script type="application/json">` is not executed and is allowed).

**Verify**: `bun run build:worker && bun run typecheck:worker` → exit 0. Add `worker/test/headers.test.ts` using `fetchWorker` and `publishShare` from `worker/test/helpers.ts`: `GET /api/health`, `GET /`, `GET /s/{id}` all carry `content-security-policy` and `x-frame-options: DENY`. Manual: `bun run worker:dev`, open a published share in a browser, confirm no CSP violations in the devtools console and that the theme still applies.

## Test plan

- `src/lib/sanitize.test.ts`: 12+ negative cases from the fixture, 5 positive preservation cases.
- `src/template.test.ts` (or in sanitize.test.ts): CSP hash matches the template's inline script.
- `worker/test/headers.test.ts`: headers on three response kinds.
- e2e: existing `e2e/comments.spec.ts` verifies highlights still resolve after sanitize-at-render.

## Done criteria

- [ ] `grep -rn "sanitizeHtml" src worker` → no matches; `grep -n "sanitizeDocumentHtml" src/lib/markdown-renderer.ts` → one match
- [ ] `bun run test` exits 0 with `sanitize.test.ts` included
- [ ] `bun run typecheck`, `bun run typecheck:worker` exit 0
- [ ] `bun run test:e2e` exits 0
- [ ] `grep -n "content-security-policy" worker/src/http.ts` → one match; `grep -n "withSecurityHeaders" worker/src/index.ts` → at least one match
- [ ] Running the Step 1 bypass inputs through `sanitizeDocumentHtml` yields no `onerror`, `javascript:`, `<iframe`, `<object`, or `<script` (covered by tests)
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

- `sanitize-html` cannot be installed or fails under Bun (report; do not fall back to the regex version).
- Mermaid SVG cannot survive any reasonable allowlist **and** the client fallback path does not re-render (check `DocumentViewer.svelte:118-135` behavior first).
- e2e highlight tests fail after moving sanitization (this indicates the DOM text changed; report which fixture).

## Maintenance notes

- Any new enhancer that reads a new attribute must add it to the allowlist; the preservation tests are where that shows up.
- Editing the theme bootstrap script requires recomputing the CSP hash (the test enforces it).
- Reviewers: compare the final allowlist with `go/internal/server/markdown.go`; divergence means the same document renders differently under the Go binary.
- Deferred: `Strict-Transport-Security` (Cloudflare sets it at the zone level for the custom domain).
