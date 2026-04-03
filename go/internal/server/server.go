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
	Files      []FileEntry
	Port       int
	Host       string
	Clean      bool
	AssetsDir  string
	Dev        bool
	OnShutdown func()
}

type FileEntry struct {
	FilePath string
	Content  []byte
}

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

	if loaded, err := ReadSettings(); err == nil {
		s.settings = loaded
	}

	s.sse = NewSSEBroker(opts.Dev, opts.OnShutdown)

	w, err := NewWatcher(func(path string) {
		s.onFileChange(path)
	})
	if err != nil {
		return nil, fmt.Errorf("watcher: %w", err)
	}
	s.watcher = w

	if opts.AssetsDir != "" {
		s.assetsFS = os.DirFS(opts.AssetsDir)
	} else if !opts.Dev {
		s.assetsFS = EmbeddedAssetsFS()
	}

	if opts.Dev {
		viteURL, _ := url.Parse("http://127.0.0.1:24678")
		s.viteProxy = httputil.NewSingleHostReverseProxy(viteURL)
	}

	for _, f := range opts.Files {
		if err := s.loadFile(f); err != nil {
			log.Printf("Warning: failed to load %s: %v", f.FilePath, err)
		}
	}

	s.registerRoutes()

	return s, nil
}

func (s *Server) registerRoutes() {
	s.mux.HandleFunc("GET /api/documents", s.listDocuments)
	s.mux.HandleFunc("POST /api/documents", s.addDocument)
	s.mux.HandleFunc("GET /api/document", s.getDocument)

	s.mux.HandleFunc("GET /api/comments/raw", s.rawComments)
	s.mux.HandleFunc("GET /api/comments", s.listComments)
	s.mux.HandleFunc("POST /api/comments", s.createComment)
	s.mux.HandleFunc("PUT /api/comments/{id}/reanchor", s.reanchorComment)
	s.mux.HandleFunc("PUT /api/comments/{id}", s.updateComment)
	s.mux.HandleFunc("DELETE /api/comments/{id}", s.deleteComment)
	s.mux.HandleFunc("DELETE /api/comments", s.deleteAllComments)

	s.mux.HandleFunc("GET /api/settings", s.getSettings)
	s.mux.HandleFunc("PUT /api/settings", s.updateSettings)

	s.mux.HandleFunc("GET /api/document/stream", s.sse.DocumentStream)
	s.mux.HandleFunc("GET /api/heartbeat", s.sse.Heartbeat)

	s.mux.HandleFunc("GET /api/health", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})

	s.mux.HandleFunc("GET /{$}", s.servePage)

	if s.assetsFS != nil {
		s.mux.Handle("GET /assets/", http.FileServer(http.FS(s.assetsFS)))
	}

	if s.isDev && s.viteProxy != nil {
		s.mux.HandleFunc("GET /", func(w http.ResponseWriter, r *http.Request) {
			s.viteProxy.ServeHTTP(w, r)
		})
	}
}

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
				log.Printf("HTTP server error: %v", err)
			}
		}()

		return p, nil
	}
	return 0, fmt.Errorf("no available port")
}

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

	result, err := s.renderer.Render(content)
	if err != nil {
		return err
	}

	s.mu.Lock()
	_, alreadyExists := s.files[absPath]
	s.files[absPath] = &FileState{
		FilePath:     absPath,
		FileName:     filepath.Base(absPath),
		Content:      content,
		RenderedHTML: result.HTML,
		Headings:     result.Headings,
		IsLoaded:     true,
	}
	if !alreadyExists {
		s.fileOrder = append(s.fileOrder, absPath)
	}
	s.mu.Unlock()

	_ = s.watcher.Add(absPath)
	return nil
}

func (s *Server) onFileChange(path string) {
	s.mu.RLock()
	_, ok := s.files[path]
	s.mu.RUnlock()
	if !ok {
		return
	}

	data, err := os.ReadFile(path)
	if err != nil {
		return
	}
	result, err := s.renderer.Render(data)
	if err != nil {
		return
	}

	s.mu.Lock()
	state, ok := s.files[path]
	if ok {
		state.Content = data
		state.RenderedHTML = result.HTML
		state.Headings = result.Headings
	}
	s.mu.Unlock()

	if !ok {
		return
	}

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

func (s *Server) servePage(w http.ResponseWriter, r *http.Request) {
	s.mu.RLock()
	defaultPath := s.defaultFilePath()
	state := s.files[defaultPath]

	if state == nil {
		s.mu.RUnlock()
		http.Error(w, "no document loaded", http.StatusNotFound)
		return
	}

	docs := make(map[string]InlineDocData)
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

	clean := s.clean
	workingDir := s.workingDir
	settings := s.settings
	s.mu.RUnlock()

	inline := InlineData{
		Files:      files,
		ActiveFile: defaultPath,
		Clean:      clean,
		WorkingDir: workingDir,
		Documents:  docs,
		Settings:   settings,
	}

	inlineJSON, err := SafeJSONStringify(inline)
	if err != nil {
		http.Error(w, "failed to serialize data", http.StatusInternalServerError)
		return
	}

	jsPath, cssPath := s.resolveAssetPaths()

	proseClass := "prose-serif"
	if settings.FontFamily == FontSansSerif {
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
		FontFamily:   settings.FontFamily,
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
