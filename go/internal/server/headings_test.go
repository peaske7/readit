package server

import "testing"

func TestSlugify(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"Hello World", "hello-world"},
		{"  Spaces  ", "spaces"},
		{"Special!@#Characters", "specialcharacters"},
		{"Multiple   Spaces", "multiple-spaces"},
		{"dash-separated", "dash-separated"},
	}

	for _, tt := range tests {
		got := slugify(tt.input)
		if got != tt.expected {
			t.Errorf("slugify(%q) = %q, want %q", tt.input, got, tt.expected)
		}
	}
}

func TestExtractHeadingsDeduplicate(t *testing.T) {
	src := []byte("# Title\n\n## Title\n\n### Title\n")
	headings := ExtractHeadings(src)

	if len(headings) != 3 {
		t.Fatalf("expected 3 headings, got %d", len(headings))
	}

	if headings[0].ID != "title" {
		t.Errorf("heading 0 ID = %q, want %q", headings[0].ID, "title")
	}
	if headings[1].ID != "title-1" {
		t.Errorf("heading 1 ID = %q, want %q", headings[1].ID, "title-1")
	}
	if headings[2].ID != "title-2" {
		t.Errorf("heading 2 ID = %q, want %q", headings[2].ID, "title-2")
	}
}

func TestExtractHeadingsSkipsCodeBlocks(t *testing.T) {
	src := []byte("# Real Heading\n\n```\n# Not a heading\n```\n\n## Another Real")
	headings := ExtractHeadings(src)

	if len(headings) != 2 {
		t.Fatalf("expected 2 headings, got %d", len(headings))
	}

	if headings[0].Text != "Real Heading" {
		t.Errorf("heading 0 text = %q", headings[0].Text)
	}
	if headings[1].Text != "Another Real" {
		t.Errorf("heading 1 text = %q", headings[1].Text)
	}
}
