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

func TestRenderTaskList(t *testing.T) {
	r := NewRenderer()
	src := "- [ ] todo\n- [x] done\n- normal\n"
	result, err := r.Render([]byte(src))
	if err != nil {
		t.Fatal(err)
	}

	if !strings.Contains(result.HTML, `<span class="task-checkbox" data-checked="false"`) {
		t.Errorf("expected unchecked task-checkbox span, got: %s", result.HTML)
	}
	if !strings.Contains(result.HTML, `<span class="task-checkbox" data-checked="true"`) {
		t.Errorf("expected checked task-checkbox span, got: %s", result.HTML)
	}
	if strings.Contains(result.HTML, "[ ]") || strings.Contains(result.HTML, "[x]") {
		t.Errorf("raw brackets should be replaced, got: %s", result.HTML)
	}
}

func TestRenderFrontmatter(t *testing.T) {
	r := NewRenderer()
	src := "---\nid: 12\ntags:\n  - daily-notes\n---\n\n# Title\n\nBody.\n"
	result, err := r.Render([]byte(src))
	if err != nil {
		t.Fatal(err)
	}

	if !strings.Contains(result.HTML, `<details class="frontmatter">`) {
		t.Errorf("expected frontmatter details block, got: %s", result.HTML)
	}
	if !strings.Contains(result.HTML, "<summary>Properties</summary>") {
		t.Errorf("expected Properties summary, got: %s", result.HTML)
	}
	// Should not render the --- as <hr>
	if strings.Contains(result.HTML, "<hr>") {
		t.Errorf("frontmatter should not produce <hr>, got: %s", result.HTML)
	}
	// Title heading should still be extracted
	if len(result.Headings) != 1 || result.Headings[0].Text != "Title" {
		t.Errorf("expected one heading 'Title', got: %#v", result.Headings)
	}
}

func TestRenderNoFrontmatterWhenUnclosed(t *testing.T) {
	r := NewRenderer()
	// A leading `---` without a closing fence is just a thematic break.
	src := "---\n\n# Title\n"
	result, err := r.Render([]byte(src))
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(result.HTML, "frontmatter") {
		t.Errorf("did not expect frontmatter block, got: %s", result.HTML)
	}
}

func TestToggleTaskInSource(t *testing.T) {
	src := "- [ ] one\n- [x] two\n- [ ] three\n"

	out, ok := ToggleTaskInSource(src, 0, true)
	if !ok {
		t.Fatal("expected ok")
	}
	if out != "- [x] one\n- [x] two\n- [ ] three\n" {
		t.Errorf("toggle 0 -> checked: got %q", out)
	}

	out, ok = ToggleTaskInSource(src, 1, false)
	if !ok {
		t.Fatal("expected ok")
	}
	if out != "- [ ] one\n- [ ] two\n- [ ] three\n" {
		t.Errorf("toggle 1 -> unchecked: got %q", out)
	}

	if _, ok := ToggleTaskInSource(src, 10, true); ok {
		t.Error("expected out-of-range to fail")
	}
}

func TestToggleTaskSkipsFrontmatter(t *testing.T) {
	src := "---\ntags:\n  - foo\n---\n\n- [ ] real task\n"
	out, ok := ToggleTaskInSource(src, 0, true)
	if !ok {
		t.Fatal("expected ok")
	}
	expected := "---\ntags:\n  - foo\n---\n\n- [x] real task\n"
	if out != expected {
		t.Errorf("got %q want %q", out, expected)
	}
}

func TestToggleTaskSkipsCodeBlocks(t *testing.T) {
	src := "- [ ] real one\n\n```\n- [ ] code sample\n```\n\n- [ ] real two\n"
	// Index 1 should refer to "real two", not the code sample
	out, ok := ToggleTaskInSource(src, 1, true)
	if !ok {
		t.Fatal("expected ok")
	}
	if !strings.Contains(out, "- [x] real two") {
		t.Errorf("expected 'real two' toggled; got %q", out)
	}
	if !strings.Contains(out, "- [ ] code sample") {
		t.Errorf("code sample should remain untouched; got %q", out)
	}
}

func TestRenderTaskListEmitsIndex(t *testing.T) {
	r := NewRenderer()
	src := "- [ ] a\n- [x] b\n- [ ] c\n"
	result, err := r.Render([]byte(src))
	if err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 3; i++ {
		needle := `data-task-index="` + string(rune('0'+i)) + `"`
		if !strings.Contains(result.HTML, needle) {
			t.Errorf("expected %s in output, got: %s", needle, result.HTML)
		}
	}

	// Re-rendering must reset the counter back to 0.
	result, err = r.Render([]byte(src))
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(result.HTML, `data-task-index="0"`) {
		t.Errorf("counter must reset between renders; got: %s", result.HTML)
	}
	if strings.Contains(result.HTML, `data-task-index="3"`) {
		t.Errorf("counter should not exceed 2 on second render; got: %s", result.HTML)
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
