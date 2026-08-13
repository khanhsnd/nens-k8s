package domain

import "context"

type UpdateStatus struct {
	Current     string `json:"current"`
	Latest      string `json:"latest"`
	Available   bool   `json:"available"`
	CanInstall  bool   `json:"canInstall"`
	Page        string `json:"page"`
	Development bool   `json:"development"`
}

// Updater answers where this copy of Nens stands against the published releases,
// and hands back the path of a verified installer to run.
type Updater interface {
	Status(ctx context.Context) (UpdateStatus, error)
	Download(ctx context.Context) (string, error)
}
