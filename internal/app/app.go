package app

import (
	"context"

	"nens-k8s/internal/config"
	"nens-k8s/internal/domain"
	"nens-k8s/internal/event"
	"nens-k8s/internal/fonts"
	"nens-k8s/internal/kube/cluster"
	"nens-k8s/internal/kube/exec"
	"nens-k8s/internal/kube/forward"
	"nens-k8s/internal/kube/kubeconfig"
	"nens-k8s/internal/kube/logs"
	"nens-k8s/internal/kube/pods"
	"nens-k8s/internal/kube/resource"
)

type App struct {
	bus         *event.Bus
	registry    domain.ClusterRegistry
	clusters    *ClusterAPI
	kubeconfigs *KubeconfigAPI
	resources   *ResourceAPI
	containers  *ContainerAPI
	logs        *LogAPI
	shells      *ExecAPI
	forwards    *PortForwardAPI
	settings    *SettingsAPI

	ctx context.Context
}

func New() *App {
	bus := event.NewBus()
	store := config.NewStore()
	loader := kubeconfig.NewLoader(store)
	registry := cluster.NewRegistry(loader, bus)
	return &App{
		bus:         bus,
		registry:    registry,
		clusters:    NewClusterAPI(registry),
		kubeconfigs: NewKubeconfigAPI(loader),
		resources:   NewResourceAPI(resource.NewStore(registry, bus), resource.NewEditor(registry)),
		containers:  NewContainerAPI(pods.NewResolver(registry)),
		logs:        NewLogAPI(logs.NewStreamer(registry, bus)),
		shells:      NewExecAPI(exec.NewRunner(registry, bus)),
		forwards:    NewPortForwardAPI(forward.NewRegistry(registry, bus, store)),
		settings:    NewSettingsAPI(store, fonts.NewSource()),
	}
}

func (a *App) Startup(ctx context.Context) {
	a.ctx = ctx
	a.bus.Bind(ctx)
	a.clusters.bind(ctx)
	a.kubeconfigs.bind(ctx)
	a.resources.bind(ctx)
	a.containers.bind(ctx)
	a.logs.bind(ctx)
	a.shells.bind(ctx)
	a.forwards.bind(ctx)
	a.settings.bind(ctx)
}

func (a *App) Shutdown(_ context.Context) {
	a.registry.Shutdown()
}

func (a *App) Bindings() []any {
	return []any{
		a.clusters,
		a.kubeconfigs,
		a.resources,
		a.containers,
		a.logs,
		a.shells,
		a.forwards,
		a.settings,
	}
}
