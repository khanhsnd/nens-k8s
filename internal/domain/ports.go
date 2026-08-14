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
	// Add references a file, or every kubeconfig directly inside a folder.
	Add(path string) ([]KubeconfigFile, error)
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

// ForwardStore is the slice of the settings a port forward needs. It is its own
// port so the forward registry does not depend on every other setting — and so
// the kubeconfig loader does not depend on forwards.
type ForwardStore interface {
	Forwards() []ForwardSpec
	SetForwards(specs []ForwardSpec) error
}

type FontSource interface {
	Families() ([]string, error)
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

type APIDiscovery interface {
	Resources(ctx context.Context, clusterID string) ([]APIResource, error)
	Refresh(ctx context.Context, clusterID string) ([]APIResource, error)
}

type MetricsSampler interface {
	Sample(ctx context.Context, clusterID string) (MetricsSample, error)
	PodSample(ctx context.Context, clusterID string, namespace string, name string) (PodUsage, error)
}

// HelmClient takes no context: helm's action API accepts none, and a parameter
// this adapter could only ignore would promise a cancellation it cannot deliver.
type HelmClient interface {
	Releases(clusterID string) ([]HelmRelease, error)
	History(ref HelmRef) ([]HelmRelease, error)
	Detail(ref HelmRef, revision int) (HelmDetail, error)
	Rollback(ref HelmRef, revision int) error
	Uninstall(ref HelmRef) error
}

type ResourceEditor interface {
	Get(ctx context.Context, ref ResourceRef) (map[string]any, error)
	Apply(ctx context.Context, ref ResourceRef, object map[string]any) (map[string]any, error)
	Delete(ctx context.Context, ref ResourceRef) error
	Scale(ctx context.Context, ref ResourceRef, replicas int32) error
	Owners(ctx context.Context, ref ResourceRef) ([]OwnerRef, error)
	Events(ctx context.Context, ref ResourceRef) ([]EventRecord, error)
}

type ContainerResolver interface {
	Targets(ctx context.Context, ref ResourceRef) ([]ContainerTarget, error)
}

type LogStreamer interface {
	Start(token string, clusterID string, target ContainerTarget, opts LogOptions) error
	Stop(token string) error
}

type ExecRunner interface {
	Start(token string, clusterID string, target ContainerTarget, opts ExecOptions) error
	NodeShell(ctx context.Context, token string, clusterID string, node string, opts ExecOptions) error
	Send(token string, data string) error
	Resize(token string, cols uint16, rows uint16) error
	Stop(token string) error
}

type PortForwarder interface {
	Ports(ctx context.Context, ref ResourceRef) ([]ForwardPort, error)
	Start(ctx context.Context, ref ResourceRef, localPort int, remotePort int) (PortForward, error)
	Restore(ctx context.Context, clusterID string) ([]PortForward, error)
	List() []PortForward
	Stop(id string) error
}

type Publisher interface {
	Publish(topic string, payload any)
}
