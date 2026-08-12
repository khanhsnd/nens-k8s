package domain

import (
	"context"

	"k8s.io/client-go/rest"
)

type KubeconfigSource interface {
	Clusters() ([]Cluster, error)
	RESTConfig(contextName string) (*rest.Config, error)
	Rename(id string, name string) error
}

type KubeconfigFiles interface {
	Files() []KubeconfigFile
	Add(path string) (KubeconfigFile, error)
	Import(content string) (KubeconfigFile, error)
	Remove(path string) error
}

type SettingsStore interface {
	Dir() (string, error)
	Kubeconfigs() []string
	SetKubeconfigs(paths []string) error
	ClusterNames() map[string]string
	SetClusterName(id string, name string) error
}

type ClusterRegistry interface {
	List() ([]Cluster, error)
	Get(id string) (Cluster, bool)
	Connect(ctx context.Context, id string) (Cluster, error)
	Disconnect(id string) error
	Rename(id string, name string) (Cluster, error)
	Shutdown()
}

type ResourceSubscriber interface {
	Subscribe(token string, clusterID string, gvr GVR, namespace string) (Subscription, error)
	Unsubscribe(token string) error
}

type Publisher interface {
	Publish(topic string, payload any)
}
