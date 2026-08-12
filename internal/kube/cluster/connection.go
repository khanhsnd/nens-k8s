package cluster

import (
	"context"

	"nens-k8s/internal/domain"

	"k8s.io/apimachinery/pkg/api/meta"
	"k8s.io/client-go/discovery"
	"k8s.io/client-go/discovery/cached/memory"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/restmapper"
)

type Connection struct {
	meta      domain.Cluster
	config    *rest.Config
	clientset *kubernetes.Clientset
	dynamic   dynamic.Interface
	discovery discovery.CachedDiscoveryInterface
	mapper    meta.RESTMapper

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
	ctx, cancel := context.WithCancel(parent)

	meta.Version = version.GitVersion
	meta.Phase = domain.PhaseConnected
	meta.Error = ""

	return &Connection{
		meta:      meta,
		config:    config,
		clientset: clientset,
		dynamic:   dyn,
		discovery: cached,
		mapper:    restmapper.NewDeferredDiscoveryRESTMapper(cached),
		ctx:       ctx,
		cancel:    cancel,
	}, nil
}

func (c *Connection) Meta() domain.Cluster { return c.meta }

func (c *Connection) Dynamic() dynamic.Interface { return c.dynamic }

func (c *Connection) Context() context.Context { return c.ctx }

func (c *Connection) Close() { c.cancel() }
