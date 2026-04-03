package server

import (
	"strings"
	"testing"
)

func TestRenderBasicMarkdown(t *testing.T) {
	r := NewRenderer()
	result, err := r.Render([]byte("# Hello\n\nSome **bold** text."))
	if err != nil {
		t.Fatal(err)
	}

	if !strings.Contains(result.HTML, "<h1") {
		t.Error("expected <h1> in output")
	}
	if !strings.Contains(result.HTML, "<strong>bold</strong>") {
		t.Error("expected <strong> in output")
	}
}

func TestRenderCodeBlock(t *testing.T) {
	r := NewRenderer()
	src := "```go\nfmt.Println(\"hello\")\n```"
	result, err := r.Render([]byte(src))
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(result.HTML, "chroma") {
		t.Error("expected chroma class in highlighted code")
	}
}

func TestRenderMermaidPassthrough(t *testing.T) {
	r := NewRenderer()
	src := "```mermaid\ngraph TD\n  A --> B\n```"
	result, err := r.Render([]byte(src))
	if err != nil {
		t.Fatal(err)
	}

	// Mermaid blocks should pass through as code blocks for client-side rendering
	if !strings.Contains(result.HTML, "language-mermaid") {
		t.Error("expected language-mermaid class in output")
	}
}

func TestRenderGFMTable(t *testing.T) {
	r := NewRenderer()
	src := "| A | B |\n|---|---|\n| 1 | 2 |"
	result, err := r.Render([]byte(src))
	if err != nil {
		t.Fatal(err)
	}

	if !strings.Contains(result.HTML, "<table>") {
		t.Error("expected <table> in GFM table output")
	}
}

func TestRenderHeadings(t *testing.T) {
	r := NewRenderer()
	result, err := r.Render([]byte("# Title\n\n## Section\n\n### Sub"))
	if err != nil {
		t.Fatal(err)
	}

	if len(result.Headings) != 3 {
		t.Fatalf("expected 3 headings, got %d", len(result.Headings))
	}

	if result.Headings[0].Level != 1 || result.Headings[0].Text != "Title" {
		t.Errorf("heading 0: got level=%d text=%q", result.Headings[0].Level, result.Headings[0].Text)
	}
	if result.Headings[1].Level != 2 || result.Headings[1].Text != "Section" {
		t.Errorf("heading 1: got level=%d text=%q", result.Headings[1].Level, result.Headings[1].Text)
	}
}
