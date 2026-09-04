# `.comments.md` conformance corpus

Every `*.comments.md` here is an input file, `*.json` is the comment file it must
parse into, and `*.canonical.md` (when present) is what serializing that parse
result must produce. When there is no `*.canonical.md`, the input is already
canonical and must round-trip byte-for-byte.

Both codecs run this corpus:

- TypeScript: `src/lib/comment-storage.test.ts`
- Go: `go/internal/server/storage_test.go`

A change to the format means changing the fixtures, which fails both suites
until both implementations agree.
