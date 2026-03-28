package server

import (
	"encoding/json"
	"fmt"
	"html/template"
	"io/fs"
	"log"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"path/filepath"
	"sync"
)

// Options configures the server.
type Options struct {
	Files     []FileEntry
	Port      int
	Host      string
	Clean     bool
	AssetsDir string // override embedded assets
	Dev       bool   // spawn Vite, proxy to it
}

// FileEntry is a file to load on startup.
type FileEntry struct {
	FilePath string
	Content  []byte // optional pre-loaded content
}

// Server is the readit HTTP server.
type Server struct {
	mux        *http.ServeMux
	files      map[string]*FileState
	fileOrder  []string
	sse        *SSEBroker
	watcher    *Watcher
	renderer   *Renderer
	settings   Settings
	workingDir string
	clean      bool
	assetsFS   fs.FS
	tmpl       *template.Template
	isDev      bool
	viteProxy  http.Handler
	mu         sync.RWMutex

	commentCache   map[string]*resolvedCacheEntry
	commentCacheMu sync.RWMutex

	httpServer *http.Server
}

type resolvedCacheEntry struct {
	commentMtimeMs int64
	sourceHash     string
	comments       []Comment
}

// NewServer creates and configures a Server.
func NewServer(opts Options) (*Server, error) {
	wd, _ := os.Getwd()

	s := &Server{
		mux:          http.NewServeMux(),
		files:        make(map[string]*FileState),
		renderer:     NewRenderer(),
		settings:     DefaultSettings(),
		workingDir:   wd,
		clean:        opts.Clean,
		tmpl:         CompileTemplate(),
		isDev:        opts.Dev,
		commentCache: make(map[string]*resolvedCacheEntry),
	}

	// Load settings from disk
	if loaded, err := ReadSettings(); err == nil {
		s.settings = loaded
	}

	// Setup SSE broker
	s.sse = NewSSEBroker(opts.Dev, func() {
		log.Println("All clients disconnected, shutting down")
		os.Exit(0)
	})

	// Setup file watcher
	w, err := NewWatcher(func(path string) {
		s.onFileChange(path)
	})
	if err != nil {
		return nil, fmt.Errorf("watcher: %w", err)
	}
	s.watcher = w

	// Setup assets
	if opts.AssetsDir != "" {
		s.assetsFS = os.DirFS(opts.AssetsDir)
	} else if !opts.Dev {
		s.assetsFS = EmbeddedAssetsFS()
	}

	// Dev mode: setup Vite proxy
	if opts.Dev {
		viteURL, _ := url.Parse("http://127.0.0.1:24678")
		s.viteProxy = httputil.NewSingleHostReverseProxy(viteURL)
	}

	// Load initial files
	for _, f := range opts.Files {
		if err := s.loadFile(f); err != nil {
			log.Printf("Warning: failed to load %s: %v", f.FilePath, err)
		}
	}

	// Register routes
	s.registerRoutes()

	return s, nil
}

func (s *Server) registerRoutes() {
	// Document routes
	s.mux.HandleFunc("GET /api/documents", s.listDocuments)
	s.mux.HandleFunc("POST /api/documents", s.addDocument)
	s.mux.HandleFunc("GET /api/document", s.getDocument)

	// Comment routes
	s.mux.HandleFunc("GET /api/comments/raw", s.rawComments)
	s.mux.HandleFunc("GET /api/comments", s.listComments)
	s.mux.HandleFunc("POST /api/comments", s.createComment)
	s.mux.HandleFunc("PUT /api/comments/{id}/reanchor", s.reanchorComment)
	s.mux.HandleFunc("PUT /api/comments/{id}", s.updateComment)
	s.mux.HandleFunc("DELETE /api/comments/{id}", s.deleteComment)
	s.mux.HandleFunc("DELETE /api/comments", s.deleteAllComments)

	// Settings routes
	s.mux.HandleFunc("GET /api/settings", s.getSettings)
	s.mux.HandleFunc("PUT /api/settings", s.updateSettings)

	// SSE
	s.mux.HandleFunc("GET /api/document/stream", s.sse.DocumentStream)
	s.mux.HandleFunc("GET /api/heartbeat", s.sse.Heartbeat)

	// Health
	s.mux.HandleFunc("GET /api/health", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})

	// Root page (SSR)
	s.mux.HandleFunc("GET /{$}", s.servePage)

	// Static assets — assetsFS root maps to dist/, files are at assets/* within it
	if s.assetsFS != nil {
		s.mux.Handle("GET /assets/", http.FileServer(http.FS(s.assetsFS)))
	}

	// Dev mode: proxy everything else to Vite
	if s.isDev && s.viteProxy != nil {
		s.mux.HandleFunc("GET /", func(w http.ResponseWriter, r *http.Request) {
			s.viteProxy.ServeHTTP(w, r)
		})
	}
}

// Start begins listening on the configured host:port.
// It tries sequential ports if the requested one is busy.
func (s *Server) Start(host string, port int) (int, error) {
	for p := port; p <= 65535; p++ {
		addr := fmt.Sprintf("%s:%d", host, p)
		ln, err := net.Listen("tcp", addr)
		if err != nil {
			if p < 65535 {
				log.Printf("Port %d is busy, trying %d...", p, p+1)
				continue
			}
			return 0, fmt.Errorf("no available port found")
		}

		s.httpServer = &http.Server{Handler: s.mux}
		log.Printf("Server listening on http://%s", addr)

		go func() {
			if err := s.httpServer.Serve(ln); err != nil && err != http.ErrServerClosed {
				log.Fatal(err)
			}
		}()

		return p, nil
	}
	return 0, fmt.Errorf("no available port")
}

// Stop gracefully shuts down the server.
func (s *Server) Stop() {
	if s.httpServer != nil {
		_ = s.httpServer.Close()
	}
	s.watcher.Close()
}

func (s *Server) loadFile(f FileEntry) error {
	absPath, err := filepath.Abs(f.FilePath)
	if err != nil {
		return err
	}
	absPath, err = filepath.EvalSymlinks(absPath)
	if err != nil {
		return err
	}

	content := f.Content
	if content == nil {
		data, err := os.ReadFile(absPath)
		if err != nil {
			return err
		}
		content = data
	}

	result := s.renderer.Render(content)

	s.mu.Lock()
	s.files[absPath] = &FileState{
		FilePath:     absPath,
		FileName:     filepath.Base(absPath),
		Content:      content,
		RenderedHTML: result.HTML,
		Headings:     result.Headings,
		IsLoaded:     true,
	}
	s.fileOrder = append(s.fileOrder, absPath)
	s.mu.Unlock()

	_ = s.watcher.Add(absPath)
	return nil
}

func (s *Server) onFileChange(path string) {
	s.mu.Lock()
	state, ok := s.files[path]
	if !ok {
		s.mu.Unlock()
		return
	}

	data, err := os.ReadFile(path)
	if err != nil {
		s.mu.Unlock()
		return
	}

	result := s.renderer.Render(data)
	state.Content = data
	state.RenderedHTML = result.HTML
	state.Headings = result.Headings
	s.mu.Unlock()

	s.invalidateCommentCache(path)

	jsonEvent, _ := json.Marshal(map[string]string{
		"type": "document-updated",
		"path": path,
	})
	s.sse.Broadcast(string(jsonEvent))
}

func (s *Server) invalidateCommentCache(path string) {
	s.commentCacheMu.Lock()
	delete(s.commentCache, path)
	s.commentCacheMu.Unlock()
}

func (s *Server) defaultFilePath() string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if len(s.fileOrder) > 0 {
		return s.fileOrder[0]
	}
	return ""
}

func (s *Server) resolveFilePath(r *http.Request) string {
	if p := r.URL.Query().Get("path"); p != "" {
		// Canonicalize to match how files are stored (symlinks resolved)
		if abs, err := filepath.Abs(p); err == nil {
			if resolved, err := filepath.EvalSymlinks(abs); err == nil {
				return resolved
			}
		}
		return p
	}
	return s.defaultFilePath()
}

func (s *Server) getFileState(path string) *FileState {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.files[path]
}

// servePage renders the initial HTML with inline data.
func (s *Server) servePage(w http.ResponseWriter, r *http.Request) {
	s.mu.RLock()
	defaultPath := s.defaultFilePath()
	state := s.files[defaultPath]
	s.mu.RUnlock()

	if state == nil {
		http.Error(w, "no document loaded", http.StatusNotFound)
		return
	}

	// Build inline data
	docs := make(map[string]InlineDocData)
	s.mu.RLock()
	for path, fs := range s.files {
		comments := s.resolveCommentsFor(path, fs)
		docs[path] = InlineDocData{
			Headings: fs.Headings,
			Comments: comments,
		}
	}

	files := make([]FileRef, 0, len(s.fileOrder))
	for _, p := range s.fileOrder {
		if f, ok := s.files[p]; ok {
			files = append(files, FileRef{Path: p, FileName: f.FileName})
		}
	}
	s.mu.RUnlock()

	inline := InlineData{
		Files:      files,
		ActiveFile: defaultPath,
		Clean:      s.clean,
		WorkingDir: s.workingDir,
		Documents:  docs,
		Settings:   s.settings,
	}

	inlineJSON, err := SafeJSONStringify(inline)
	if err != nil {
		http.Error(w, "failed to serialize data", http.StatusInternalServerError)
		return
	}

	// Resolve asset paths
	jsPath, cssPath := s.resolveAssetPaths()

	proseClass := "prose-serif"
	if s.settings.FontFamily == FontSansSerif {
		proseClass = "prose-sans"
	}

	var viteClient template.HTML
	if s.isDev {
		viteClient = `<script type="module" src="http://127.0.0.1:24678/@vite/client"></script>`
	}

	data := TemplateData{
		Title:        state.FileName,
		CSSPath:      cssPath,
		JSPath:       jsPath,
		DocumentHTML: template.HTML(state.RenderedHTML),
		InlineJSON:   inlineJSON,
		IsDev:        s.isDev,
		FontFamily:   s.settings.FontFamily,
		ProseClass:   proseClass,
		ViteClient:   viteClient,
	}

	page, err := RenderPage(s.tmpl, data)
	if err != nil {
		http.Error(w, "template error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	_, _ = w.Write([]byte(page))
}

func (s *Server) resolveAssetPaths() (jsPath, cssPath string) {
	if s.isDev {
		return "http://127.0.0.1:24678/src/main.ts", ""
	}

	// Try reading Vite manifest
	if s.assetsFS != nil {
		data, err := fs.ReadFile(s.assetsFS, ".vite/manifest.json")
		if err == nil {
			var manifest map[string]struct {
				File string   `json:"file"`
				CSS  []string `json:"css"`
			}
			if json.Unmarshal(data, &manifest) == nil {
				if entry, ok := manifest["index.html"]; ok {
					jsPath = "/" + entry.File
					if len(entry.CSS) > 0 {
						cssPath = "/" + entry.CSS[0]
					}
					return
				}
			}
		}
	}

	return "/assets/index.js", ""
}

// Helper functions for JSON responses.

func writeJSON(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(data)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

func readJSON(r *http.Request, v any) error {
	defer func() { _ = r.Body.Close() }()
	return json.NewDecoder(r.Body).Decode(v)
}
