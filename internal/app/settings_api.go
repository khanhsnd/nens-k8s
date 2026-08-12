package app

import (
	"context"

	"nens-k8s/internal/domain"
)

type SettingsAPI struct {
	settings domain.SettingsStore
	fonts    domain.FontSource
	ctx      context.Context
}

func NewSettingsAPI(settings domain.SettingsStore, fonts domain.FontSource) *SettingsAPI {
	return &SettingsAPI{settings: settings, fonts: fonts}
}

func (a *SettingsAPI) bind(ctx context.Context) {
	a.ctx = ctx

	// Scanning the font directories takes a couple of seconds; doing it now means
	// the settings dialog does not wait for it.
	go func() { _, _ = a.fonts.Families() }()
}

// Dir is where everything Nens writes lives: settings.json and the imported
// kubeconfigs next to it.
func (a *SettingsAPI) Dir() (string, error) {
	return a.settings.Dir()
}

func (a *SettingsAPI) Fonts() ([]string, error) {
	return a.fonts.Families()
}

func (a *SettingsAPI) Reveal(path string) error {
	return reveal(path)
}
