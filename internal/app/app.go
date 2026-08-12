package app

import (
	"context"

	"nens-k8s/internal/config"
	"nens-k8s/internal/domain"
	"nens-k8s/internal/event"
	"nens-k8s/internal/kube/cluster"
	"nens-k8s/internal/kube/kubeconfig"
	"nens-k8s/internal/kube/logs"
	"nens-k8s/internal/kube/resource"
)

type App struct {
	bus         *event.Bus
	registry    domain.ClusterRegistry
	clusters    *ClusterAPI
	kubeconfigs *KubeconfigAPI
	resources   *ResourceAPI
	logs        *LogAPI

	ctx context.Context
}

func New() *App {
	bus := event.NewBus()
	loader := kubeconfig.NewLoader(config.NewStore())
	registry := cluster.NewRegistry(loader, bus)
	return &App{
		bus:         bus,
		registry:    registry,
		clusters:    NewClusterAPI(registry),
		kubeconfigs: NewKubeconfigAPI(loader),
		resources:   NewResourceAPI(resource.NewStore(registry, bus), resource.NewEditor(registry)),
		logs:        NewLogAPI(logs.NewStreamer(registry, bus)),
	}
}

func (a *App) Startup(ctx context.Context) {
	a.ctx = ctx
	a.bus.Bind(ctx)
	a.clusters.bind(ctx)
	a.kubeconfigs.bind(ctx)
	a.resources.bind(ctx)
	a.logs.bind(ctx)
}

func (a *App) Shutdown(_ context.Context) {
	a.registry.Shutdown()
}

func (a *App) Bindings() []any {
	return []any{a.clusters, a.kubeconfigs, a.resources, a.logs}
}
