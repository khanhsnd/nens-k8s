package app

import (
	"context"

	"nens-k8s/internal/domain"
)

type ContainerAPI struct {
	containers domain.ContainerResolver
	ctx        context.Context
}

func NewContainerAPI(containers domain.ContainerResolver) *ContainerAPI {
	return &ContainerAPI{containers: containers}
}

func (a *ContainerAPI) bind(ctx context.Context) {
	a.ctx = ctx
}

func (a *ContainerAPI) Targets(ref domain.ResourceRef) ([]domain.ContainerTarget, error) {
	return a.containers.Targets(a.ctx, ref)
}
