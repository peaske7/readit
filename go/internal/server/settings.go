package server

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
)

func isThemeMode(v string) bool {
	return v == "system" || v == "light" || v == "dark"
}

func isTableMode(v string) bool {
	return v == "auto" || v == "fit" || v == "wide"
}

func DefaultSettings() Settings {
	return Settings{
		Version:    1,
		FontFamily: FontSerif,
	}
}

func ReadSettings() (Settings, error) {
	data, err := os.ReadFile(SettingsPath())
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
	path := SettingsPath()
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
		ThemeMode   string       `json:"themeMode"`
		TableMode   string       `json:"tableMode"`
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

	if body.ThemeMode != "" && !isThemeMode(body.ThemeMode) {
		writeError(w, http.StatusBadRequest, "themeMode must be 'system', 'light' or 'dark'")
		return
	}
	if body.TableMode != "" && !isTableMode(body.TableMode) {
		writeError(w, http.StatusBadRequest, "tableMode must be 'auto', 'fit' or 'wide'")
		return
	}

	for _, kb := range body.Keybindings {
		if kb.ID == "" {
			writeError(w, http.StatusBadRequest, "keybinding id is required")
			return
		}
		if kb.Binding != nil && kb.Binding.Key == "" {
			writeError(w, http.StatusBadRequest, "keybinding key is required when binding is provided")
			return
		}
	}

	// Build new settings under write lock for atomicity
	s.mu.Lock()
	newSettings := s.settings

	if body.FontFamily != "" {
		newSettings.FontFamily = body.FontFamily
	}
	if body.ThemeMode != "" {
		newSettings.ThemeMode = body.ThemeMode
	}
	if body.TableMode != "" {
		newSettings.TableMode = body.TableMode
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
