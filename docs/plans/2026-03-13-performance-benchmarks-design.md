# Performance Benchmarks Design

## Context

readit feels slow across startup, rendering, and interactions. The main JS bundle is 748 KB (230 KB gzipped), with no code splitting. Heavy libraries (react-markdown, mermaid, react-syntax-highlighter) load upfront.

## Goal

Establish Vitest bench benchmarks for critical server-side and library operations, with a <50ms target per operation. CI-gated to prevent regressions.

## Scope

Benchmark the four core user flows:

1. **Adding comments** — anchor resolution, comment serialization, file I/O
2. **Copying/exporting comments** — export formatting, context extraction
3. **Startup** — time-to-first-byte once server is up (exception: process spawn, browser open)
4. **Rendering/reading** — margin layout calculations

Client-side rendering (react-markdown, syntax highlighting) is out of scope for Vitest bench — those require Playwright, which can be added later.

## Approach: Vitest Bench

Use Vitest's built-in `bench` mode (powered by tinybench). Benchmark files are co-located with source, following the existing `*.test.ts` pattern.

### Benchmark files

```
src/lib/
├── anchor.bench.ts          # findAnchorWithFallback
├── comment-storage.bench.ts # parse, serialize, computeHash
├── margin-layout.bench.ts   # position calculations
├── export.bench.ts          # export formatting
├── context.bench.ts         # LLM context extraction
└── __fixtures__/
    └── bench-data.ts        # shared synthetic test data
```

### What each benchmark measures

#### `anchor.bench.ts` — hottest path

- `findAnchorWithFallback()` with exact match (best case)
- `findAnchorWithFallback()` with fuzzy match (worst case)
- Both against a ~300-line synthetic Markdown document

#### `comment-storage.bench.ts`

- `parseCommentFile()` with 1, 10, 50 comments
- `serializeComments()` with 1, 10, 50 comments
- `computeHash()` on a ~300-line document

#### `margin-layout.bench.ts`

- Position resolution with 1, 10, 50 comments
- Overlap resolution (worst case: all comments on adjacent lines)

#### `export.bench.ts` + `context.bench.ts`

- Export to JSON format with 10, 50 comments
- Export to prompt format with 10, 50 comments
- Context extraction for a ~300-line document

### Test fixtures (`__fixtures__/bench-data.ts`)

Shared synthetic data:

- A ~300-line Markdown document representative of real usage
- Comment sets at various sizes (1, 10, 50)
- Pre-computed anchors for deterministic benchmarks

### Running benchmarks

```bash
pnpm bench    # vitest bench
```

Package.json script:

```json
"bench": "vitest bench"
```

### CI integration

GitHub Actions runs `pnpm bench` after tests pass. Vitest bench outputs timing statistics (min, max, mean, p99).

For hard CI gating, each benchmark file includes a companion assertion in the existing test file:

```ts
test('anchor resolution completes under 50ms', () => {
  const start = performance.now()
  for (let i = 0; i < 100; i++) {
    findAnchorWithFallback({ source: doc, selectedText: text, lineHint: 'L150' })
  }
  const elapsed = (performance.now() - start) / 100
  expect(elapsed).toBeLessThan(50)
})
```

This gives both:

- **Benchmark data** (vitest bench) — for tracking performance over time
- **Hard assertions** (vitest test) — for CI gating at <50ms

## Performance target

| Operation | Target |
|-----------|--------|
| All benchmarked operations | < 50ms |
| Exceptions: process spawn, browser open, port binding | As fast as possible |

## Future work

- Playwright benchmarks for client-side rendering (react-markdown, syntax highlighting, comment highlight positioning)
- Bundle size budgets if bundle growth becomes a concern
- `Server-Timing` headers on API routes for production observability
