package server

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
)

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

func (s *Server) sourceLock(path string) *sync.Mutex {
	s.sourceFileMu.Lock()
	defer s.sourceFileMu.Unlock()
	mu, ok := s.sourceFileLocks[path]
	if !ok {
		mu = &sync.Mutex{}
		s.sourceFileLocks[path] = mu
	}
	return mu
}

func (s *Server) toggleTask(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Path    string `json:"path"`
		Index   int    `json:"index"`
		Checked bool   `json:"checked"`
	}
	if err := readJSON(r, &body); err != nil || body.Path == "" {
		writeError(w, http.StatusBadRequest, "path and index are required")
		return
	}

	absPath, err := filepath.Abs(body.Path)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid path")
		return
	}
	if resolved, err := filepath.EvalSymlinks(absPath); err == nil {
		absPath = resolved
	}

	// Only allow toggling tasks in files we've explicitly loaded — prevents
	// arbitrary writes to the filesystem via this endpoint.
	s.mu.RLock()
	state := s.files[absPath]
	s.mu.RUnlock()
	if state == nil {
		writeError(w, http.StatusNotFound, "file not loaded")
		return
	}

	// Serialize concurrent task toggles for the same file. Without this, two
	// rapid clicks each do read → modify → write from the same on-disk state,
	// and the second write clobbers the first.
	lock := s.sourceLock(absPath)
	lock.Lock()
	defer lock.Unlock()

	current, err := os.ReadFile(absPath)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "read failed")
		return
	}

	updated, ok := ToggleTaskInSource(string(current), body.Index, body.Checked)
	if !ok {
		writeError(w, http.StatusBadRequest, "task index out of range")
		return
	}
	if updated == string(current) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "unchanged"})
		return
	}

	if err := atomicWriteFile(absPath, []byte(updated)); err != nil {
		writeError(w, http.StatusInternalServerError, "write failed")
		return
	}

	// The file watcher will pick up the change, re-render, and broadcast SSE.
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// atomicWriteFile writes to a temp file in the same directory, then renames
// over the target. This avoids partial writes if the process is interrupted.
func atomicWriteFile(path string, data []byte) error {
	dir := filepath.Dir(path)
	base := filepath.Base(path)
	tmp, err := os.CreateTemp(dir, "."+base+".*.tmp")
	if err != nil {
		return err
	}
	tmpPath := tmp.Name()
	if _, err := tmp.Write(data); err != nil {
		_ = tmp.Close()
		_ = os.Remove(tmpPath)
		return err
	}
	if err := tmp.Close(); err != nil {
		_ = os.Remove(tmpPath)
		return err
	}
	if err := os.Rename(tmpPath, path); err != nil {
		_ = os.Remove(tmpPath)
		return err
	}
	// preserve original mode if possible
	if info, err := os.Stat(path); err == nil {
		_ = os.Chmod(path, info.Mode())
	}
	return nil
}

