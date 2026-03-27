package server

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
)

// DefaultSettings returns the default settings.
func DefaultSettings() Settings {
	return Settings{
		Version:    1,
		FontFamily: FontSerif,
	}
}

func settingsPath() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".readit", "settings.json")
}

// ReadSettings loads settings from ~/.readit/settings.json.
func ReadSettings() (Settings, error) {
	data, err := os.ReadFile(settingsPath())
	if err != nil {
		return DefaultSettings(), err
	}
	s := DefaultSettings()
	if err := json.Unmarshal(data, &s); err != nil {
		return DefaultSettings(), err
	}
	return s, nil
}

// WriteSettings atomically saves settings to disk.
func WriteSettings(s Settings) error {
	path := settingsPath()
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(s, "", "  ")
	if err != nil {
		return err
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, 0644); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}

// getSettings handles GET /api/settings.
func (s *Server) getSettings(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, s.settings)
}

// updateSettings handles PUT /api/settings.
func (s *Server) updateSettings(w http.ResponseWriter, r *http.Request) {
	var body struct {
		FontFamily string `json:"fontFamily"`
	}
	if err := readJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if body.FontFamily != "" {
		if body.FontFamily != FontSerif && body.FontFamily != FontSansSerif {
			writeError(w, http.StatusBadRequest, "fontFamily must be 'serif' or 'sans-serif'")
			return
		}
		s.settings.FontFamily = body.FontFamily
	}

	if err := WriteSettings(s.settings); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to save settings")
		return
	}

	writeJSON(w, http.StatusOK, s.settings)
}
