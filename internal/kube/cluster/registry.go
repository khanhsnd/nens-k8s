package cluster

import (
	"context"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"nens-k8s/internal/domain"
	"nens-k8s/internal/event"
)

type Registry struct {
	source domain.KubeconfigSource
	bus    domain.Publisher

	mu    sync.RWMutex
	conns map[string]*Connection
}

func NewRegistry(source domain.KubeconfigSource, bus domain.Publisher) *Registry {
	return &Registry{
		source: source,
		bus:    bus,
		conns:  make(map[string]*Connection),
	}
}

func (r *Registry) List() ([]domain.Cluster, error) {
	clusters, err := r.source.Clusters()
	if err != nil {
		return nil, err
	}

	r.mu.RLock()
	defer r.mu.RUnlock()
	for i, c := range clusters {
		if conn, ok := r.conns[c.ID]; ok {
			clusters[i] = conn.Meta()
		}
	}
	return clusters, nil
}

func (r *Registry) Get(id string) (domain.Cluster, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	conn, ok := r.conns[id]
	if !ok {
		return domain.Cluster{}, false
	}
	return conn.Meta(), true
}

func (r *Registry) Connection(id string) (*Connection, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	conn, ok := r.conns[id]
	return conn, ok
}

func (r *Registry) Connect(ctx context.Context, id string) (domain.Cluster, error) {
	if existing, ok := r.Get(id); ok {
		return existing, nil
	}

	meta, err := r.lookup(id)
	if err != nil {
		return domain.Cluster{}, err
	}

	meta.Phase = domain.PhaseConnecting
	r.bus.Publish(event.TopicClusterChanged, meta)
	slog.Info("cluster connecting", "cluster", id, "server", meta.Server)

	started := time.Now()
	config, err := r.source.RESTConfig(meta.Context)
	if err != nil {
		return r.fail(meta, err)
	}

	conn, err := Dial(ctx, meta, config)
	if err != nil {
		return r.fail(meta, err)
	}

	r.mu.Lock()
	r.conns[id] = conn
	r.mu.Unlock()

	slog.Info("cluster connected", "cluster", id, "version", conn.Meta().Version, "took", time.Since(started))
	r.bus.Publish(event.TopicClusterChanged, conn.Meta())
	return conn.Meta(), nil
}

func (r *Registry) Disconnect(id string) error {
	r.mu.Lock()
	conn, ok := r.conns[id]
	delete(r.conns, id)
	r.mu.Unlock()

	if !ok {
		return nil
	}

	conn.Close()
	meta := conn.Meta()
	meta.Phase = domain.PhaseDisconnected
	meta.Version = ""
	slog.Info("cluster disconnected", "cluster", id)
	r.bus.Publish(event.TopicClusterChanged, meta)
	return nil
}

func (r *Registry) Rename(id string, name string) (domain.Cluster, error) {
	if err := r.source.Rename(id, name); err != nil {
		return domain.Cluster{}, err
	}

	meta, err := r.lookup(id)
	if err != nil {
		return domain.Cluster{}, err
	}

	if conn, ok := r.Connection(id); ok {
		conn.Rename(meta.Name)
		meta = conn.Meta()
	}

	r.bus.Publish(event.TopicClusterChanged, meta)
	return meta, nil
}

func (r *Registry) Shutdown() {
	r.mu.Lock()
	conns := r.conns
	r.conns = make(map[string]*Connection)
	r.mu.Unlock()

	slog.Info("closing cluster connections", "count", len(conns))
	for _, conn := range conns {
		conn.Close()
	}
}

func (r *Registry) lookup(id string) (domain.Cluster, error) {
	clusters, err := r.source.Clusters()
	if err != nil {
		return domain.Cluster{}, err
	}
	for _, c := range clusters {
		if c.ID == id {
			return c, nil
		}
	}
	return domain.Cluster{}, fmt.Errorf("cluster %q not found in kubeconfig", id)
}

func (r *Registry) fail(meta domain.Cluster, err error) (domain.Cluster, error) {
	meta.Phase = domain.PhaseError
	meta.Error = err.Error()
	slog.Error("cluster connection failed", "cluster", meta.ID, "server", meta.Server, "error", err)
	r.bus.Publish(event.TopicClusterChanged, meta)
	return meta, err
}
