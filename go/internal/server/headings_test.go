package server

import "testing"

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
	src := []byte("# Real Heading\n\n```\n# Not a heading\n```\n\n## Another Real\n")
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

func TestExtractHeadingsLevels(t *testing.T) {
	src := []byte("# H1\n## H2\n### H3\n#### H4\n##### H5\n###### H6\n")
	headings := ExtractHeadings(src)

	if len(headings) != 6 {
		t.Fatalf("expected 6 headings, got %d", len(headings))
	}

	for i, h := range headings {
		if h.Level != i+1 {
			t.Errorf("heading %d level = %d, want %d", i, h.Level, i+1)
		}
	}
}

func TestExtractHeadingsSetextStyle(t *testing.T) {
	src := []byte("Setext H1\n=========\n\nSetext H2\n---------\n")
	headings := ExtractHeadings(src)

	if len(headings) != 2 {
		t.Fatalf("expected 2 headings, got %d", len(headings))
	}

	if headings[0].Text != "Setext H1" {
		t.Errorf("heading 0 text = %q, want %q", headings[0].Text, "Setext H1")
	}
	if headings[0].Level != 1 {
		t.Errorf("heading 0 level = %d, want 1", headings[0].Level)
	}
	if headings[1].Text != "Setext H2" {
		t.Errorf("heading 1 text = %q, want %q", headings[1].Text, "Setext H2")
	}
	if headings[1].Level != 2 {
		t.Errorf("heading 1 level = %d, want 2", headings[1].Level)
	}
}
