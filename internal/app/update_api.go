package app

import (
	"context"
	"errors"
	"log/slog"

	"nens-k8s/internal/domain"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

type UpdateAPI struct {
	updates domain.Updater
	ctx     context.Context
}

func NewUpdateAPI(updates domain.Updater) *UpdateAPI {
	return &UpdateAPI{updates: updates}
}

func (a *UpdateAPI) bind(ctx context.Context) {
	a.ctx = ctx
}

func (a *UpdateAPI) Check() (domain.UpdateStatus, error) {
	return a.updates.Status(a.ctx)
}

func (a *UpdateAPI) Install() error {
	path, err := a.updates.Download(a.ctx)
	if err != nil {
		return err
	}
	if err := startInstaller(path); err != nil {
		slog.Error("installer refused to start", "path", path, "error", err)
		return err
	}

	slog.Info("installer started, quitting", "path", path)
	runtime.Quit(a.ctx)
	return nil
}

func (a *UpdateAPI) OpenRelease() error {
	status, err := a.updates.Status(a.ctx)
	if err != nil {
		return err
	}
	if status.Page == "" {
		return errors.New("there is no published release to open")
	}

	runtime.BrowserOpenURL(a.ctx, status.Page)
	return nil
}
