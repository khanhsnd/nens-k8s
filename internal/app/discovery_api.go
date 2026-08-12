package app

import (
	"context"

	"nens-k8s/internal/domain"
)

type DiscoveryAPI struct {
	discovery domain.APIDiscovery
	ctx       context.Context
}

func NewDiscoveryAPI(discovery domain.APIDiscovery) *DiscoveryAPI {
	return &DiscoveryAPI{discovery: discovery}
}

func (a *DiscoveryAPI) bind(ctx context.Context) {
	a.ctx = ctx
}

func (a *DiscoveryAPI) Resources(clusterID string) ([]domain.APIResource, error) {
	return a.discovery.Resources(a.ctx, clusterID)
}

func (a *DiscoveryAPI) Refresh(clusterID string) ([]domain.APIResource, error) {
	return a.discovery.Refresh(a.ctx, clusterID)
}
