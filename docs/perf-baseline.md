# Performance Baseline

Captured: 2026-03-27
Machine: Darwin 25.3.0 (Apple Silicon)
Runtime: Bun
Build: production (`bun run build`)

## E2E Metrics (Playwright, Chromium)

### Initial Load

| Tier | Lines | Comments | FCP | DCL | All Highlights Painted | Highlights Found |
|------|-------|----------|-----|-----|------------------------|------------------|
| medium | 1,000 | 100 | 112ms | 74ms | **886ms** | 100 |
| large | 3,000 | 200 | 368ms | 22ms | **3,247ms** | 193 |

### Interactions

| Metric | Tier | Result |
|--------|------|--------|
| Add comment (time to new highlight) | medium | **98ms** |
| Text selection (median of 5) | medium | **9ms** |
| Tab switch (medium → medium-b, 100 → 100 comments) | medium | **414ms** |

### Scroll Performance

| Tier | Total Scroll Time | Long Tasks (>50ms) | P50 | P95 | P99 |
|------|-------------------|-------------------|-----|-----|-----|
| medium (1000 lines, 100 comments) | 8,953ms | 0 | 0ms | 0ms | 0ms |
| large (3000 lines, 200 comments) | 25,912ms | 3 | 106ms | 121ms | 121ms |

## Bundle Size

| Asset | Raw | Gzipped |
|-------|-----|---------|
| Main JS (index-*.js) | 667 KB | 206 KB |
| Total dist/assets/ | 6.5 MB | — |
| CSS (index-*.css) | 45 KB | — |
| CLI (cli.js) | 51 KB | — |

### Top chunks by size

| Chunk | Size | Purpose |
|-------|------|---------|
| index-DCIQ7W07.js | 652 KB | Main app bundle |
| chunk-XZSTWKYB.js | 426 KB | Mermaid core |
| cytoscape.esm.js | 424 KB | Mermaid dependency |
| katex.js | 250 KB | Math rendering (mermaid) |
| prism.js | 146 KB | Syntax highlighter |
| architectureDiagram.js | 143 KB | Mermaid architecture |
| chunk-7R4GIKGN.js | 124 KB | Mermaid support |
| esm.js | 112 KB | Mermaid support |

## Vitest Bench (Server-side Operations)

> Run with: `bun run bench`

### Anchor Resolution

| Benchmark | ops/sec | Mean | p99 |
|-----------|---------|------|-----|
| findAnchor — exact, medium doc | 340,789 | 0.003ms | 0.006ms |
| findAnchor — exact, large doc | 348,679 | 0.003ms | 0.006ms |
| findAnchorNormalized — large doc | 10,414 | 0.096ms | 0.406ms |
| findAnchorFuzzy — mutated text, large doc | 163 | **6.13ms** | 6.41ms |
| findAnchorWithFallback — 1 comment | 101 | **9.86ms** | 10.27ms |
| findAnchorWithFallback — 10 comments | 39 | **25.66ms** | 26.10ms |
| findAnchorWithFallback — 50 comments | 3 | **313.30ms** | 640.60ms |

### Comment Storage

| Benchmark | ops/sec | Mean | p99 |
|-----------|---------|------|-----|
| parseCommentFile — 1 comment | 881,595 | 0.001ms | 0.003ms |
| parseCommentFile — 10 comments | 165,610 | 0.006ms | 0.009ms |
| parseCommentFile — 50 comments | 34,588 | 0.029ms | 0.045ms |
| serializeComments — 1 comment | 2,011,903 | 0.0005ms | 0.001ms |
| serializeComments — 10 comments | 286,303 | 0.004ms | 0.005ms |
| serializeComments — 50 comments | 59,027 | 0.017ms | 0.029ms |
| computeHash — 300 lines | 169,082 | 0.006ms | 0.009ms |

### Margin Layout

| Benchmark | ops/sec | Mean | p99 |
|-----------|---------|------|-----|
| well-spaced — 1 comment | 6,192,537 | 0.0002ms | 0.0002ms |
| well-spaced — 10 comments | 942,048 | 0.001ms | 0.002ms |
| well-spaced — 50 comments | 167,170 | 0.006ms | 0.009ms |
| clustered — 10 comments | 932,383 | 0.001ms | 0.002ms |
| clustered — 50 comments | 165,792 | 0.006ms | 0.009ms |
| with input zone — 50 comments | 143,787 | 0.007ms | 0.010ms |

### Export

| Benchmark | ops/sec | Mean |
|-----------|---------|------|
| formatComment — single | 17,270,891 | 0.00006ms |
| generatePrompt — 10 comments | 927,600 | 0.001ms |
| generatePrompt — 50 comments | 189,187 | 0.005ms |

### Highlight System (DOM Operations) — *the optimization target*

| Benchmark | ops/sec | Mean | p99 |
|-----------|---------|------|-----|
| findTextPosition — 1 comment | 61,802 | 0.016ms | 0.033ms |
| findTextPosition — 10 comments | 17,713 | 0.057ms | 0.116ms |
| findTextPosition — 50 comments | 4,555 | 0.220ms | 0.634ms |
| getDOMTextContent — medium doc | 40,004 | 0.025ms | 0.055ms |
| getDOMTextContent — large doc | 17,498 | 0.057ms | 0.222ms |
| collectTextNodes — medium doc | 41,437 | 0.024ms | 0.070ms |
| collectTextNodes — large doc | 21,645 | 0.046ms | 0.113ms |
| **applyBatch + clear — 10 highlights, medium** | **2,308** | **0.433ms** | **2.156ms** |
| **applyBatch + clear — 50 highlights, large** | **660** | **1.515ms** | **5.350ms** |

## Key Bottlenecks (from analysis)

1. **All Highlights Painted** is the critical metric: 886ms (medium), 3,247ms (large)
   - Dominated by: react-markdown parse → React reconcile → rAF → TreeWalker → Worker → TreeWalker → DOM surgery
2. **Tab switch** (414ms) is highlight re-application on a new document
3. **Large doc scroll** shows 3 long tasks (106-121ms) — likely margin note position recalculation or highlight intersection
4. **Bundle**: 667KB main + lazy mermaid (1MB+) means slow cold loads on constrained networks

## Optimization Targets

| Change | Metric to Watch | Current | Goal |
|--------|----------------|---------|------|
| Server-side MD rendering | FCP, All Highlights Painted | 886ms / 3,247ms | <100ms / <500ms |
| CSS Custom Highlight API | All Highlights Painted, Add Comment | 886ms / 98ms | <100ms / <20ms |
| Eliminate SPA waterfall | FCP | 112ms / 368ms | <30ms |
| Drop heavy client deps | Bundle size (main JS) | 667KB | <50KB |
