package app

import (
	"context"
	"log/slog"

	"nens-k8s/internal/domain"
)

type SettingsAPI struct {
	settings domain.SettingsStore
	fonts    domain.FontSource
	version  string
	ctx      context.Context
}

func NewSettingsAPI(settings domain.SettingsStore, fonts domain.FontSource, version string) *SettingsAPI {
	return &SettingsAPI{settings: settings, fonts: fonts, version: version}
}

func (a *SettingsAPI) bind(ctx context.Context) {
	a.ctx = ctx

	// Scanning the font directories takes a couple of seconds; doing it now means
	// the settings dialog does not wait for it.
	go func() {
		if _, err := a.fonts.Families(); err != nil {
			slog.Warn("installed fonts not listed", "error", err)
		}
	}()
}

// Dir is where everything Nens writes lives: settings.json, nens.log and the
// imported kubeconfigs next to them.
func (a *SettingsAPI) Dir() (string, error) {
	return a.settings.Dir()
}

func (a *SettingsAPI) Version() string {
	return a.version
}

func (a *SettingsAPI) Fonts() ([]string, error) {
	return a.fonts.Families()
}

func (a *SettingsAPI) Reveal(path string) error {
	return reveal(path)
}
