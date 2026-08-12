package app

import (
	"context"

	"nens-k8s/internal/domain"
)

type LogAPI struct {
	streams domain.LogStreamer
	ctx     context.Context
}

func NewLogAPI(streams domain.LogStreamer) *LogAPI {
	return &LogAPI{streams: streams}
}

func (a *LogAPI) bind(ctx context.Context) {
	a.ctx = ctx
}

func (a *LogAPI) Targets(ref domain.ResourceRef) ([]domain.LogTarget, error) {
	return a.streams.Targets(a.ctx, ref)
}

func (a *LogAPI) Start(token string, clusterID string, target domain.LogTarget, opts domain.LogOptions) error {
	return a.streams.Start(token, clusterID, target, opts)
}

func (a *LogAPI) Stop(token string) error {
	return a.streams.Stop(token)
}
