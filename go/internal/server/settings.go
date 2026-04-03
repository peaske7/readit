package server

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
)

func DefaultSettings() Settings {
	return Settings{
		Version:    1,
		FontFamily: FontSerif,
	}
}

func settingsPath() string {
	home, err := os.UserHomeDir()
	if err != nil || home == "" {
		return ".readit/settings.json"
	}
	return filepath.Join(home, ".readit", "settings.json")
}

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

func (s *Server) getSettings(w http.ResponseWriter, r *http.Request) {
	s.mu.RLock()
	settings := s.settings
	s.mu.RUnlock()
	writeJSON(w, http.StatusOK, settings)
}

func (s *Server) updateSettings(w http.ResponseWriter, r *http.Request) {
	var body struct {
		FontFamily  string       `json:"fontFamily"`
		Keybindings []Keybinding `json:"keybindings"`
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
	}

	// Build new settings under write lock for atomicity
	s.mu.Lock()
	newSettings := s.settings

	if body.FontFamily != "" {
		newSettings.FontFamily = body.FontFamily
	}
	if body.Keybindings != nil {
		newSettings.Keybindings = body.Keybindings
	}

	if err := WriteSettings(newSettings); err != nil {
		s.mu.Unlock()
		writeError(w, http.StatusInternalServerError, "failed to save settings")
		return
	}

	s.settings = newSettings
	s.mu.Unlock()

	writeJSON(w, http.StatusOK, newSettings)
}
