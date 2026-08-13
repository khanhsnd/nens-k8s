package resource

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"nens-k8s/internal/domain"
	"nens-k8s/internal/kube/cluster"

	"k8s.io/client-go/dynamic/dynamicinformer"
	"k8s.io/client-go/tools/cache"
)

const resyncPeriod = 10 * time.Minute

type Clusters interface {
	Connection(id string) (*cluster.Connection, bool)
}

type target struct {
	cluster   string
	gvr       domain.GVR
	namespace string
}

type Store struct {
	clusters Clusters
	bus      domain.Publisher

	mu      sync.Mutex
	watches map[target]*watch
	tokens  map[string]target
}

func NewStore(clusters Clusters, bus domain.Publisher) *Store {
	return &Store{
		clusters: clusters,
		bus:      bus,
		watches:  make(map[target]*watch),
		tokens:   make(map[string]target),
	}
}

func (s *Store) Subscribe(token string, clusterID string, gvr domain.GVR, namespace string) (domain.Subscription, error) {
	if token == "" {
		return domain.Subscription{}, errors.New("subscription token is required")
	}
	conn, ok := s.clusters.Connection(clusterID)
	if !ok {
		return domain.Subscription{}, fmt.Errorf("cluster %q is not connected", clusterID)
	}

	key := target{cluster: clusterID, gvr: gvr, namespace: namespace}

	s.mu.Lock()
	if _, taken := s.tokens[token]; taken {
		s.mu.Unlock()
		return domain.Subscription{}, fmt.Errorf("subscription %q already exists", token)
	}
	w, running := s.watches[key]
	if !running {
		w = s.start(conn, key)
		s.watches[key] = w
	}
	s.tokens[token] = key
	w.addToken(token)
	s.mu.Unlock()

	slog.Debug("subscribed", "token", token, "cluster", clusterID, "resource", gvr.Resource, "namespace", namespace)
	w.publishSnapshot(token)
	return domain.Subscription{Token: token, ClusterID: clusterID, GVR: gvr, Namespace: namespace}, nil
}

func (s *Store) Unsubscribe(token string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	key, ok := s.tokens[token]
	if !ok {
		return nil
	}
	delete(s.tokens, token)
	slog.Debug("unsubscribed", "token", token, "cluster", key.cluster, "resource", key.gvr.Resource, "namespace", key.namespace)

	w, ok := s.watches[key]
	if !ok || !w.removeToken(token) {
		return nil
	}
	delete(s.watches, key)
	w.stop()
	return nil
}

func (s *Store) start(conn *cluster.Connection, key target) *watch {
	informer := dynamicinformer.NewFilteredDynamicInformer(
		conn.Dynamic(),
		schemaGVR(key.gvr),
		key.namespace,
		resyncPeriod,
		cache.Indexers{cache.NamespaceIndex: cache.MetaNamespaceIndexFunc},
		nil,
	).Informer()

	ctx, cancel := context.WithCancel(conn.Context())
	log := slog.With("cluster", key.cluster, "resource", key.gvr.Resource, "namespace", key.namespace)
	w := newWatch(s.bus, informer, cancel, log)

	log.Info("informer started")
	go informer.Run(ctx.Done())
	go func() {
		if cache.WaitForCacheSync(ctx.Done(), informer.HasSynced) {
			w.markSynced()
		}
		<-ctx.Done()
		log.Info("informer stopped")
		s.drop(key, w)
	}()

	return w
}

func (s *Store) drop(key target, w *watch) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.watches[key] != w {
		return
	}
	delete(s.watches, key)
	for token, owner := range s.tokens {
		if owner == key {
			delete(s.tokens, token)
		}
	}
}
