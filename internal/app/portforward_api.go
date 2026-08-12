package app

import (
	"context"

	"nens-k8s/internal/domain"
)

type PortForwardAPI struct {
	forwards domain.PortForwarder
	ctx      context.Context
}

func NewPortForwardAPI(forwards domain.PortForwarder) *PortForwardAPI {
	return &PortForwardAPI{forwards: forwards}
}

func (a *PortForwardAPI) bind(ctx context.Context) {
	a.ctx = ctx
}

func (a *PortForwardAPI) Ports(ref domain.ResourceRef) ([]domain.ForwardPort, error) {
	return a.forwards.Ports(a.ctx, ref)
}

func (a *PortForwardAPI) Start(ref domain.ResourceRef, localPort int, remotePort int) (domain.PortForward, error) {
	return a.forwards.Start(a.ctx, ref, localPort, remotePort)
}

func (a *PortForwardAPI) Restore(clusterID string) ([]domain.PortForward, error) {
	return a.forwards.Restore(a.ctx, clusterID)
}

func (a *PortForwardAPI) List() []domain.PortForward {
	return a.forwards.List()
}

func (a *PortForwardAPI) Stop(id string) error {
	return a.forwards.Stop(id)
}
