package cluster

import (
	"context"
	"sync"

	"nens-k8s/internal/domain"

	apimeta "k8s.io/apimachinery/pkg/api/meta"
	"k8s.io/client-go/discovery"
	"k8s.io/client-go/discovery/cached/memory"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/restmapper"
)

type Connection struct {
	mu        sync.RWMutex
	meta      domain.Cluster
	config    *rest.Config
	clientset *kubernetes.Clientset
	dynamic   dynamic.Interface
	discovery discovery.CachedDiscoveryInterface
	mapper    apimeta.RESTMapper

	ctx    context.Context
	cancel context.CancelFunc
}

func Dial(parent context.Context, meta domain.Cluster, config *rest.Config) (*Connection, error) {
	clientset, err := kubernetes.NewForConfig(config)
	if err != nil {
		return nil, err
	}
	dyn, err := dynamic.NewForConfig(config)
	if err != nil {
		return nil, err
	}

	version, err := clientset.Discovery().ServerVersion()
	if err != nil {
		return nil, err
	}

	cached := memory.NewMemCacheClient(clientset.Discovery())

	meta.Version = version.GitVersion
	meta.Phase = domain.PhaseConnected
	meta.Error = ""

	conn := NewConnection(parent, meta, dyn, restmapper.NewDeferredDiscoveryRESTMapper(cached))
	conn.config = config
	conn.clientset = clientset
	conn.discovery = cached
	return conn, nil
}

func NewConnection(parent context.Context, meta domain.Cluster, dyn dynamic.Interface, mapper apimeta.RESTMapper) *Connection {
	ctx, cancel := context.WithCancel(parent)

	return &Connection{
		meta:    meta,
		dynamic: dyn,
		mapper:  mapper,
		ctx:     ctx,
		cancel:  cancel,
	}
}

func (c *Connection) Meta() domain.Cluster {
	c.mu.RLock()
	defer c.mu.RUnlock()

	return c.meta
}

func (c *Connection) Rename(name string) {
	c.mu.Lock()
	defer c.mu.Unlock()

	c.meta.Name = name
}

func (c *Connection) Dynamic() dynamic.Interface { return c.dynamic }

func (c *Connection) Mapper() apimeta.RESTMapper { return c.mapper }

func (c *Connection) Context() context.Context { return c.ctx }

func (c *Connection) Close() { c.cancel() }
