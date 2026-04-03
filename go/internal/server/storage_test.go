package server

import "testing"

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
