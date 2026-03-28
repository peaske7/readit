package server

import (
	"net/http"
	"os"
	"strings"
)

// resolveCommentsFor reads and anchor-resolves comments for a file.
func (s *Server) resolveCommentsFor(path string, state *FileState) []Comment {
	commentPath := CommentPath(path)

	// Check cache
	s.commentCacheMu.RLock()
	cached := s.commentCache[path]
	s.commentCacheMu.RUnlock()

	sourceHash := ComputeHash(state.Content)

	info, err := os.Stat(commentPath)
	if err != nil {
		// No comment file — return empty
		return []Comment{}
	}

	mtimeMs := info.ModTime().UnixMilli()
	if cached != nil && cached.sourceHash == sourceHash && cached.commentMtimeMs == mtimeMs {
		return cached.comments
	}

	// Parse comment file
	data, err := os.ReadFile(commentPath)
	if err != nil {
		return []Comment{}
	}

	cf, err := ParseCommentFile(data)
	if err != nil {
		return []Comment{}
	}

	// Resolve anchors
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

			// Map to DOM text position for highlighting
			if start, end, ok := FindTextPosition(domText, searchText, result.StartOffset); ok {
				c.StartOffset = start
				c.EndOffset = end
			}
		} else {
			c.AnchorConfidence = AnchorUnresolved
		}

		resolved = append(resolved, c)
	}

	// Cache result
	s.commentCacheMu.Lock()
	s.commentCache[path] = &resolvedCacheEntry{
		commentMtimeMs: mtimeMs,
		sourceHash:     sourceHash,
		comments:       resolved,
	}
	s.commentCacheMu.Unlock()

	return resolved
}

// listComments handles GET /api/comments?path=...
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

// createComment handles POST /api/comments?path=...
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

	// Read existing comments
	commentPath := CommentPath(path)
	cf := CommentFile{
		Source:  path,
		Hash:    ComputeHash(state.Content),
		Version: FormatVersion,
	}

	if data, err := os.ReadFile(commentPath); err == nil {
		if parsed, err := ParseCommentFile(data); err == nil {
			cf = parsed
		}
	}
	cf.Hash = ComputeHash(state.Content)
	cf.Comments = append(cf.Comments, c)

	if err := WriteCommentFile(commentPath, cf); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to save comment")
		return
	}
	s.invalidateCommentCache(path)

	writeJSON(w, http.StatusCreated, map[string]any{"comment": c})
}

// updateComment handles PUT /api/comments/{id}?path=...
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

	commentPath := CommentPath(path)
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

// deleteComment handles DELETE /api/comments/{id}?path=...
func (s *Server) deleteComment(w http.ResponseWriter, r *http.Request) {
	path := s.resolveFilePath(r)
	commentID := r.PathValue("id")

	commentPath := CommentPath(path)
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
		_ = os.Remove(commentPath)
	} else {
		cf.Comments = filtered
		_ = WriteCommentFile(commentPath, cf)
	}
	s.invalidateCommentCache(path)

	writeJSON(w, http.StatusOK, map[string]bool{"success": true})
}

// deleteAllComments handles DELETE /api/comments?path=...
func (s *Server) deleteAllComments(w http.ResponseWriter, r *http.Request) {
	path := s.resolveFilePath(r)
	commentPath := CommentPath(path)
	_ = os.Remove(commentPath)
	s.invalidateCommentCache(path)
	writeJSON(w, http.StatusOK, map[string]bool{"success": true})
}

// reanchorComment handles PUT /api/comments/{id}/reanchor?path=...
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

	commentPath := CommentPath(path)
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

// rawComments handles GET /api/comments/raw?path=...
func (s *Server) rawComments(w http.ResponseWriter, r *http.Request) {
	path := s.resolveFilePath(r)
	commentPath := CommentPath(path)

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
