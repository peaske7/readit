package server

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func setupBenchServer(b *testing.B, lines int) (*Server, string) {
	b.Helper()

	// Generate markdown content
	var sb strings.Builder
	sb.WriteString("# Benchmark Document\n\n")
	for i := range lines {
		switch i % 10 {
		case 0:
			fmt.Fprintf(&sb, "## Section %d\n\n", i/10)
		case 5:
			sb.WriteString("```go\nfunc hello() {\n\tfmt.Println(\"world\")\n}\n```\n\n")
		default:
			fmt.Fprintf(&sb, "Paragraph %d with **bold** and *italic* text and `code`.\n\n", i)
		}
	}

	// Write to temp file
	tmpDir := b.TempDir()
	filePath := filepath.Join(tmpDir, "bench.md")
	if err := os.WriteFile(filePath, []byte(sb.String()), 0644); err != nil {
		b.Fatal(err)
	}

	srv, err := NewServer(Options{
		Files: []FileEntry{{FilePath: filePath}},
		Port:  0,
		Host:  "127.0.0.1",
	})
	if err != nil {
		b.Fatal(err)
	}

	return srv, filePath
}

// BenchmarkSSRPage measures the full SSR page render (TTFB equivalent).
func BenchmarkSSRPage1000Lines(b *testing.B) {
	srv, _ := setupBenchServer(b, 1000)
	defer srv.watcher.Close()
	b.ResetTimer()

	for i := 0; i < b.N; i++ {
		req := httptest.NewRequest("GET", "/", nil)
		w := httptest.NewRecorder()
		srv.mux.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			b.Fatalf("unexpected status %d", w.Code)
		}
	}
}

func BenchmarkSSRPage3000Lines(b *testing.B) {
	srv, _ := setupBenchServer(b, 3000)
	defer srv.watcher.Close()
	b.ResetTimer()

	for i := 0; i < b.N; i++ {
		req := httptest.NewRequest("GET", "/", nil)
		w := httptest.NewRecorder()
		srv.mux.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			b.Fatalf("unexpected status %d", w.Code)
		}
	}
}

// BenchmarkGetDocument measures the /api/document JSON response.
func BenchmarkGetDocument1000Lines(b *testing.B) {
	srv, filePath := setupBenchServer(b, 1000)
	defer srv.watcher.Close()
	b.ResetTimer()

	for i := 0; i < b.N; i++ {
		req := httptest.NewRequest("GET", "/api/document?path="+filePath, nil)
		w := httptest.NewRecorder()
		srv.mux.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			b.Fatalf("unexpected status %d", w.Code)
		}
	}
}

// BenchmarkStartup measures cold server creation (init + first render).
func BenchmarkServerStartup1000Lines(b *testing.B) {
	var sb strings.Builder
	sb.WriteString("# Benchmark Document\n\n")
	for i := range 1000 {
		fmt.Fprintf(&sb, "Paragraph %d with **bold** text.\n\n", i)
	}

	tmpDir := b.TempDir()
	filePath := filepath.Join(tmpDir, "bench.md")
	if err := os.WriteFile(filePath, []byte(sb.String()), 0644); err != nil {
		b.Fatal(err)
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		srv, err := NewServer(Options{
			Files: []FileEntry{{FilePath: filePath}},
			Port:  0,
			Host:  "127.0.0.1",
		})
		if err != nil {
			b.Fatal(err)
		}
		srv.watcher.Close()
	}
}
