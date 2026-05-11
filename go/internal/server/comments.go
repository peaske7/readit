package server

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"sync"
)

func (s *Server) commentLock(path string) *sync.Mutex {
	s.commentFileMu.Lock()
	defer s.commentFileMu.Unlock()
	mu, ok := s.commentFileLocks[path]
	if !ok {
		mu = &sync.Mutex{}
		s.commentFileLocks[path] = mu
	}
	return mu
}

func (s *Server) resolveCommentsFor(path string, state *FileState) []Comment {
	commentPath, err := CommentPath(path)
	if err != nil {
		log.Printf("Warning: failed to resolve comment path for %s: %v", path, err)
		return []Comment{}
	}

	s.commentCacheMu.RLock()
	cached := s.commentCache[path]
	s.commentCacheMu.RUnlock()

	sourceHash := ComputeHash(state.Content)

	info, err := os.Stat(commentPath)
	if err != nil {
		if os.IsNotExist(err) {
			return []Comment{}
		}
		log.Printf("Warning: unexpected error checking comment file %s: %v", commentPath, err)
		return []Comment{}
	}

	mtimeMs := info.ModTime().UnixMilli()
	if cached != nil && cached.sourceHash == sourceHash && cached.commentMtimeMs == mtimeMs {
		return cached.comments
	}

	data, err := os.ReadFile(commentPath)
	if err != nil {
		return []Comment{}
	}

	cf, err := ParseCommentFile(data)
	if err != nil {
		return []Comment{}
	}

	sourceContent := string(state.Content)
	domText := ExtractTextFromHTML(state.RenderedHTML)

	resolved := make([]Comment, 0, len(cf.Comments))
	for _, c := range cf.Comments {
		searchText := c.SelectedText
		if c.AnchorPrefix != "" {
			searchText = c.AnchorPrefix
		}

		result := FindAnchorWithFallback(sourceContent, searchText, c.LineHint)
		if result != nil {
			c.StartOffset = result.StartOffset
			c.EndOffset = result.EndOffset
			c.AnchorConfidence = result.Confidence

			if start, end, ok := FindTextPosition(domText, searchText, result.StartOffset); ok {
				c.StartOffset = start
				c.EndOffset = end
			}
		} else {
			c.AnchorConfidence = AnchorUnresolved
		}

		resolved = append(resolved, c)
	}

	s.commentCacheMu.Lock()
	s.commentCache[path] = &resolvedCacheEntry{
		commentMtimeMs: mtimeMs,
		sourceHash:     sourceHash,
		comments:       resolved,
	}
	s.commentCacheMu.Unlock()

	return resolved
}

func (s *Server) listComments(w http.ResponseWriter, r *http.Request) {
	path := s.resolveFilePath(r)
	state := s.getFileState(path)
	if state == nil {
		writeError(w, http.StatusNotFound, "document not found")
		return
	}

	comments := s.resolveCommentsFor(path, state)
	writeJSON(w, http.StatusOK, map[string]any{"comments": comments})
}

func (s *Server) createComment(w http.ResponseWriter, r *http.Request) {
	path := s.resolveFilePath(r)
	state := s.getFileState(path)
	if state == nil {
		writeError(w, http.StatusNotFound, "document not found")
		return
	}

	var body struct {
		SelectedText string `json:"selectedText"`
		Comment      string `json:"comment"`
		StartOffset  int    `json:"startOffset"`
		EndOffset    int    `json:"endOffset"`
	}
	if err := readJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if body.SelectedText == "" || body.Comment == "" {
		writeError(w, http.StatusBadRequest, "selectedText and comment are required")
		return
	}

	c := CreateComment(body.SelectedText, body.Comment, body.StartOffset, body.EndOffset, string(state.Content))

	mu := s.commentLock(path)
	mu.Lock()
	defer mu.Unlock()

	commentPath, err := CommentPath(path)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to resolve comment path")
		return
	}
	cf := CommentFile{
		Source:  path,
		Hash:    ComputeHash(state.Content),
		Version: FormatVersion,
	}

	if data, err := os.ReadFile(commentPath); err == nil {
		parsed, parseErr := ParseCommentFile(data)
		if parseErr != nil {
			writeError(w, http.StatusInternalServerError, fmt.Sprintf("failed to parse existing comment file: %v", parseErr))
			return
		}
		cf = parsed
	} else if !os.IsNotExist(err) {
		writeError(w, http.StatusInternalServerError, fmt.Sprintf("failed to read comment file: %v", err))
		return
	}
	cf.Hash = ComputeHash(state.Content)
	cf.Comments = append(cf.Comments, c)

	if err := WriteCommentFile(commentPath, cf); err != nil {
		writeError(w, http.StatusInternalServerError, fmt.Sprintf("failed to save comment: %v", err))
		return
	}
	s.invalidateCommentCache(path)

	writeJSON(w, http.StatusCreated, map[string]any{"comment": c})
}

func (s *Server) updateComment(w http.ResponseWriter, r *http.Request) {
	path := s.resolveFilePath(r)
	commentID := r.PathValue("id")

	var body struct {
		Comment string `json:"comment"`
	}
	if err := readJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	mu := s.commentLock(path)
	mu.Lock()
	defer mu.Unlock()

	commentPath, err := CommentPath(path)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to resolve comment path")
		return
	}
	data, err := os.ReadFile(commentPath)
	if err != nil {
		writeError(w, http.StatusNotFound, "comment file not found")
		return
	}

	cf, err := ParseCommentFile(data)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to parse comments")
		return
	}

	for i := range cf.Comments {
		if cf.Comments[i].ID == commentID {
			cf.Comments[i].Comment = strings.TrimSpace(body.Comment)

			if err := WriteCommentFile(commentPath, cf); err != nil {
				writeError(w, http.StatusInternalServerError, "failed to save")
				return
			}
			s.invalidateCommentCache(path)
			writeJSON(w, http.StatusOK, map[string]any{"comment": cf.Comments[i]})
			return
		}
	}

	writeError(w, http.StatusNotFound, "comment not found")
}

func (s *Server) deleteComment(w http.ResponseWriter, r *http.Request) {
	path := s.resolveFilePath(r)
	commentID := r.PathValue("id")

	mu := s.commentLock(path)
	mu.Lock()
	defer mu.Unlock()

	commentPath, err := CommentPath(path)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to resolve comment path")
		return
	}
	data, err := os.ReadFile(commentPath)
	if err != nil {
		writeError(w, http.StatusNotFound, "comment file not found")
		return
	}

	cf, err := ParseCommentFile(data)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to parse comments")
		return
	}

	filtered := make([]Comment, 0, len(cf.Comments))
	for _, c := range cf.Comments {
		if c.ID != commentID {
			filtered = append(filtered, c)
		}
	}

	if len(filtered) == len(cf.Comments) {
		writeError(w, http.StatusNotFound, "comment not found")
		return
	}

	if len(filtered) == 0 {
		if err := os.Remove(commentPath); err != nil && !os.IsNotExist(err) {
			writeError(w, http.StatusInternalServerError, "failed to delete comment file")
			return
		}
	} else {
		cf.Comments = filtered
		if err := WriteCommentFile(commentPath, cf); err != nil {
			writeError(w, http.StatusInternalServerError, "failed to save comments")
			return
		}
	}
	s.invalidateCommentCache(path)

	writeJSON(w, http.StatusOK, map[string]bool{"success": true})
}

func (s *Server) deleteAllComments(w http.ResponseWriter, r *http.Request) {
	path := s.resolveFilePath(r)

	mu := s.commentLock(path)
	mu.Lock()
	defer mu.Unlock()

	commentPath, err := CommentPath(path)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to resolve comment path")
		return
	}
	if err := os.Remove(commentPath); err != nil && !os.IsNotExist(err) {
		writeError(w, http.StatusInternalServerError, "failed to delete comment file")
		return
	}
	s.invalidateCommentCache(path)
	writeJSON(w, http.StatusOK, map[string]bool{"success": true})
}

func (s *Server) reanchorComment(w http.ResponseWriter, r *http.Request) {
	path := s.resolveFilePath(r)
	state := s.getFileState(path)
	if state == nil {
		writeError(w, http.StatusNotFound, "document not found")
		return
	}

	commentID := r.PathValue("id")

	var body struct {
		SelectedText string `json:"selectedText"`
		StartOffset  int    `json:"startOffset"`
		EndOffset    int    `json:"endOffset"`
	}
	if err := readJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	mu := s.commentLock(path)
	mu.Lock()
	defer mu.Unlock()

	commentPath, err := CommentPath(path)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to resolve comment path")
		return
	}
	data, err := os.ReadFile(commentPath)
	if err != nil {
		writeError(w, http.StatusNotFound, "comment file not found")
		return
	}

	cf, err := ParseCommentFile(data)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to parse comments")
		return
	}

	sourceContent := string(state.Content)
	for i := range cf.Comments {
		if cf.Comments[i].ID == commentID {
			truncated := TruncateSelection(body.SelectedText)
			cf.Comments[i].SelectedText = truncated
			cf.Comments[i].StartOffset = body.StartOffset
			cf.Comments[i].EndOffset = body.EndOffset
			cf.Comments[i].LineHint = GetLineHint(sourceContent, body.StartOffset, body.EndOffset)
			cf.Comments[i].AnchorConfidence = AnchorExact

			if len(body.SelectedText) > MaxSelectionLength {
				cf.Comments[i].AnchorPrefix = body.SelectedText[:min(AnchorPrefixLength, len(body.SelectedText))]
			} else {
				cf.Comments[i].AnchorPrefix = ""
			}

			cf.Hash = ComputeHash(state.Content)
			if err := WriteCommentFile(commentPath, cf); err != nil {
				writeError(w, http.StatusInternalServerError, "failed to save")
				return
			}
			s.invalidateCommentCache(path)
			writeJSON(w, http.StatusOK, map[string]any{"comment": cf.Comments[i]})
			return
		}
	}

	writeError(w, http.StatusNotFound, "comment not found")
}

func (s *Server) rawComments(w http.ResponseWriter, r *http.Request) {
	path := s.resolveFilePath(r)
	commentPath, err := CommentPath(path)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to resolve comment path")
		return
	}

	data, err := os.ReadFile(commentPath)
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]any{
			"content": nil,
			"path":    commentPath,
		})
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"content": string(data),
		"path":    commentPath,
	})
}
