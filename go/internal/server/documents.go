package server

import (
	"encoding/json"
	"net/http"
	"path/filepath"
	"strings"
)

// listDocuments handles GET /api/documents.
func (s *Server) listDocuments(w http.ResponseWriter, r *http.Request) {
	s.mu.RLock()
	files := make([]FileRef, 0, len(s.fileOrder))
	for _, p := range s.fileOrder {
		if f, ok := s.files[p]; ok {
			files = append(files, FileRef{Path: p, FileName: f.FileName})
		}
	}
	clean := s.clean
	workingDir := s.workingDir
	s.mu.RUnlock()

	writeJSON(w, http.StatusOK, map[string]any{
		"files":            files,
		"clean":            clean,
		"workingDirectory": workingDir,
	})
}

// addDocument handles POST /api/documents.
func (s *Server) addDocument(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Path string `json:"path"`
	}
	if err := readJSON(r, &body); err != nil || body.Path == "" {
		writeError(w, http.StatusBadRequest, "path is required")
		return
	}

	absPath, err := filepath.Abs(body.Path)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid path")
		return
	}
	absPath, err = filepath.EvalSymlinks(absPath)
	if err != nil {
		writeError(w, http.StatusNotFound, "file not found")
		return
	}

	if !isMarkdownFile(absPath) {
		writeError(w, http.StatusBadRequest, "only markdown files are supported")
		return
	}

	s.mu.RLock()
	_, exists := s.files[absPath]
	s.mu.RUnlock()

	if exists {
		writeJSON(w, http.StatusOK, map[string]string{
			"path":     absPath,
			"fileName": filepath.Base(absPath),
			"status":   "present",
		})
		return
	}

	if err := s.loadFile(FileEntry{FilePath: absPath}); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load file")
		return
	}

	fileName := filepath.Base(absPath)

	event, _ := json.Marshal(map[string]string{
		"type":     "document-added",
		"path":     absPath,
		"fileName": fileName,
	})
	s.sse.Broadcast(string(event))

	writeJSON(w, http.StatusOK, map[string]string{
		"path":     absPath,
		"fileName": fileName,
		"status":   "added",
	})
}

// getDocument handles GET /api/document?path=...
func (s *Server) getDocument(w http.ResponseWriter, r *http.Request) {
	path := s.resolveFilePath(r)

	s.mu.RLock()
	state := s.files[path]
	clean := s.clean
	s.mu.RUnlock()

	if state == nil {
		writeError(w, http.StatusNotFound, "document not found")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"html":     state.RenderedHTML,
		"headings": state.Headings,
		"filePath": state.FilePath,
		"fileName": state.FileName,
		"clean":    clean,
	})
}

func isMarkdownFile(path string) bool {
	ext := strings.ToLower(filepath.Ext(path))
	return ext == ".md" || ext == ".markdown"
}
