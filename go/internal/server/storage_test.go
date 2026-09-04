package server

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

func TestComputeHash(t *testing.T) {
	hash := ComputeHash([]byte("hello world"))
	if len(hash) != HashLength {
		t.Errorf("expected hash length %d, got %d", HashLength, len(hash))
	}

	hash2 := ComputeHash([]byte("hello world"))
	if hash != hash2 {
		t.Error("same input should produce same hash")
	}

	hash3 := ComputeHash([]byte("different"))
	if hash == hash3 {
		t.Error("different input should produce different hash")
	}
}

func TestTruncateSelection(t *testing.T) {
	short := "short text"
	if TruncateSelection(short) != short {
		t.Error("short text should not be truncated")
	}

	long := make([]byte, 2000)
	for i := range long {
		long[i] = 'a'
	}
	truncated := TruncateSelection(string(long))
	if len(truncated) > MaxSelectionLength+10 {
		t.Errorf("truncated length %d exceeds max %d", len(truncated), MaxSelectionLength)
	}
	if truncated[0] != 'a' {
		t.Error("truncated should start with original content")
	}
	if truncated[len(truncated)-1] != 'a' {
		t.Error("truncated should end with original content")
	}
}

func TestGetLineNumber(t *testing.T) {
	content := "line1\nline2\nline3"
	if n := GetLineNumber(content, 0); n != 1 {
		t.Errorf("offset 0: got line %d, want 1", n)
	}
	if n := GetLineNumber(content, 6); n != 2 {
		t.Errorf("offset 6: got line %d, want 2", n)
	}
	if n := GetLineNumber(content, 12); n != 3 {
		t.Errorf("offset 12: got line %d, want 3", n)
	}
}

func TestGetLineHint(t *testing.T) {
	content := "line1\nline2\nline3"
	if h := GetLineHint(content, 0, 3); h != "L1" {
		t.Errorf("same line: got %q, want L1", h)
	}
	if h := GetLineHint(content, 0, 12); h != "L1-L3" {
		t.Errorf("multi line: got %q, want L1-L3", h)
	}
}

func TestParseAndSerializeRoundTrip(t *testing.T) {
	original := CommentFile{
		Source:  "/path/to/file.md",
		Hash:    "abcdef1234567890",
		Version: 1,
		Comments: []Comment{
			{
				ID:           "abc12345",
				SelectedText: "hello world",
				Comment:      "this is a comment",
				CreatedAt:    "2026-03-27T00:00:00Z",
				LineHint:     "L42",
			},
			{
				ID:           "def67890",
				SelectedText: "another selection",
				Comment:      "second comment",
				CreatedAt:    "2026-03-27T01:00:00Z",
				LineHint:     "L55-L60",
				AnchorPrefix: "another",
			},
		},
	}

	serialized := SerializeComments(original)
	parsed, err := ParseCommentFile(serialized)
	if err != nil {
		t.Fatal(err)
	}

	if parsed.Source != original.Source {
		t.Errorf("source: got %q, want %q", parsed.Source, original.Source)
	}
	if parsed.Hash != original.Hash {
		t.Errorf("hash: got %q, want %q", parsed.Hash, original.Hash)
	}
	if len(parsed.Comments) != len(original.Comments) {
		t.Fatalf("comments: got %d, want %d", len(parsed.Comments), len(original.Comments))
	}

	for i := range original.Comments {
		if parsed.Comments[i].ID != original.Comments[i].ID {
			t.Errorf("comment %d ID: got %q, want %q", i, parsed.Comments[i].ID, original.Comments[i].ID)
		}
		if parsed.Comments[i].SelectedText != original.Comments[i].SelectedText {
			t.Errorf("comment %d selectedText: got %q, want %q", i, parsed.Comments[i].SelectedText, original.Comments[i].SelectedText)
		}
		if parsed.Comments[i].Comment != original.Comments[i].Comment {
			t.Errorf("comment %d comment: got %q, want %q", i, parsed.Comments[i].Comment, original.Comments[i].Comment)
		}
	}
}

func TestParseLegacyTwoFieldMarker(t *testing.T) {
	legacy := []byte(`---
source: /test.md
hash: abc
version: 1
---

<!-- c:abcd1234|L5 -->
> selected text

a comment body

---
`)

	cf, err := ParseCommentFile(legacy)
	if err != nil {
		t.Fatal(err)
	}
	if len(cf.Comments) != 1 {
		t.Fatalf("expected 1 comment from legacy 2-field marker, got %d", len(cf.Comments))
	}
	c := cf.Comments[0]
	if c.ID != "abcd1234" {
		t.Errorf("ID: got %q, want %q", c.ID, "abcd1234")
	}
	if c.LineHint != "L5" {
		t.Errorf("LineHint: got %q, want %q", c.LineHint, "L5")
	}
	if c.CreatedAt != "" {
		t.Errorf("CreatedAt: got %q, want empty string", c.CreatedAt)
	}
}

func TestHomeHonorsReaditHome(t *testing.T) {
	home := t.TempDir()
	t.Setenv("READIT_HOME", home)

	if got := Home(); got != home {
		t.Errorf("Home() = %q, want %q", got, home)
	}
	if got := CommentsDir(); got != filepath.Join(home, "comments") {
		t.Errorf("CommentsDir() = %q", got)
	}
	if got := SettingsPath(); got != filepath.Join(home, "settings.json") {
		t.Errorf("SettingsPath() = %q", got)
	}
	if got := ServerInfoPath(); got != filepath.Join(home, "server.json") {
		t.Errorf("ServerInfoPath() = %q", got)
	}

	// Same layout as getCommentPath() in src/lib/comment-storage.ts.
	got, err := CommentPath("/home/user/doc.md")
	if err != nil {
		t.Fatalf("CommentPath: %v", err)
	}
	want := filepath.Join(home, "comments", "home/user/doc.comments.md")
	if got != want {
		t.Errorf("CommentPath() = %q, want %q", got, want)
	}
}

func TestCanonicalPathResolvesSymlinks(t *testing.T) {
	dir := t.TempDir()
	target := filepath.Join(dir, "doc.md")
	link := filepath.Join(dir, "link.md")

	if err := os.WriteFile(target, []byte("# doc"), 0644); err != nil {
		t.Fatalf("write: %v", err)
	}
	if err := os.Symlink(target, link); err != nil {
		t.Fatalf("symlink: %v", err)
	}

	got, err := CanonicalPath(link)
	if err != nil {
		t.Fatalf("CanonicalPath: %v", err)
	}
	want, err := filepath.EvalSymlinks(target)
	if err != nil {
		t.Fatalf("EvalSymlinks: %v", err)
	}
	if got != want {
		t.Errorf("CanonicalPath(%q) = %q, want %q", link, got, want)
	}

	if _, err := CanonicalPath(filepath.Join(dir, "missing.md")); err == nil {
		t.Error("CanonicalPath should fail for a missing file")
	}
}

// goldenCommentFile mirrors the JSON shape of a parsed comment file, which is
// the TypeScript CommentFile in src/schema.ts.
type goldenCommentFile struct {
	Source   string    `json:"source"`
	Hash     string    `json:"hash"`
	Version  int       `json:"version"`
	Comments []Comment `json:"comments"`
}

// TestConformanceCorpus runs the shared fixtures in fixtures/comments, which
// src/lib/comment-storage.test.ts runs too: a divergence between the two
// codecs fails here.
func TestConformanceCorpus(t *testing.T) {
	dir := filepath.Join("..", "..", "..", "fixtures", "comments")
	inputs, err := filepath.Glob(filepath.Join(dir, "*.comments.md"))
	if err != nil {
		t.Fatal(err)
	}
	if len(inputs) == 0 {
		t.Fatalf("no fixtures found in %s", dir)
	}

	for _, inputPath := range inputs {
		name := strings.TrimSuffix(filepath.Base(inputPath), ".comments.md")
		t.Run(name, func(t *testing.T) {
			input, err := os.ReadFile(inputPath)
			if err != nil {
				t.Fatal(err)
			}

			goldenJSON, err := os.ReadFile(filepath.Join(dir, name+".json"))
			if err != nil {
				t.Fatal(err)
			}
			var want goldenCommentFile
			if err := json.Unmarshal(goldenJSON, &want); err != nil {
				t.Fatal(err)
			}

			got, err := ParseCommentFile(input)
			if err != nil {
				t.Fatal(err)
			}
			if got.Source != want.Source || got.Hash != want.Hash || got.Version != want.Version {
				t.Errorf("front matter: got %+v, want source=%q hash=%q version=%d",
					got, want.Source, want.Hash, want.Version)
			}
			if len(got.Comments) != len(want.Comments) {
				t.Fatalf("comments: got %d, want %d", len(got.Comments), len(want.Comments))
			}
			for i := range want.Comments {
				if !reflect.DeepEqual(got.Comments[i], want.Comments[i]) {
					t.Errorf("comment %d:\n got %+v\nwant %+v", i, got.Comments[i], want.Comments[i])
				}
			}

			// The canonical form is what serializing the parse result must produce;
			// without a *.canonical.md the fixture is itself canonical.
			canonical := input
			if data, err := os.ReadFile(filepath.Join(dir, name+".canonical.md")); err == nil {
				canonical = data
			}
			if serialized := SerializeComments(got); string(serialized) != string(canonical) {
				t.Errorf("serialize:\n got %q\nwant %q", serialized, canonical)
			}
			reparsed, err := ParseCommentFile(canonical)
			if err != nil {
				t.Fatal(err)
			}
			if serialized := SerializeComments(reparsed); string(serialized) != string(canonical) {
				t.Errorf("canonical is not a fixed point:\n got %q\nwant %q", serialized, canonical)
			}
		})
	}
}
