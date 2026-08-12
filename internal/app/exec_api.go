package app

import (
	"context"

	"nens-k8s/internal/domain"
)

type ExecAPI struct {
	sessions domain.ExecRunner
	ctx      context.Context
}

func NewExecAPI(sessions domain.ExecRunner) *ExecAPI {
	return &ExecAPI{sessions: sessions}
}

func (a *ExecAPI) bind(ctx context.Context) {
	a.ctx = ctx
}

func (a *ExecAPI) Start(token string, clusterID string, target domain.ContainerTarget, opts domain.ExecOptions) error {
	return a.sessions.Start(token, clusterID, target, opts)
}

func (a *ExecAPI) NodeShell(token string, clusterID string, node string, opts domain.ExecOptions) error {
	return a.sessions.NodeShell(a.ctx, token, clusterID, node, opts)
}

func (a *ExecAPI) Send(token string, data string) error {
	return a.sessions.Send(token, data)
}

func (a *ExecAPI) Resize(token string, cols uint16, rows uint16) error {
	return a.sessions.Resize(token, cols, rows)
}

func (a *ExecAPI) Stop(token string) error {
	return a.sessions.Stop(token)
}
