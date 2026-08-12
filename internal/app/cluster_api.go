package app

import (
	"context"

	"nens-k8s/internal/domain"
)

type ClusterAPI struct {
	registry domain.ClusterRegistry
	ctx      context.Context
}

func NewClusterAPI(registry domain.ClusterRegistry) *ClusterAPI {
	return &ClusterAPI{registry: registry}
}

func (a *ClusterAPI) bind(ctx context.Context) {
	a.ctx = ctx
}

func (a *ClusterAPI) List() ([]domain.Cluster, error) {
	return a.registry.List()
}

func (a *ClusterAPI) Connect(id string) (domain.Cluster, error) {
	return a.registry.Connect(a.ctx, id)
}

func (a *ClusterAPI) Disconnect(id string) error {
	return a.registry.Disconnect(id)
}

func (a *ClusterAPI) Rename(id string, name string) (domain.Cluster, error) {
	return a.registry.Rename(id, name)
}
