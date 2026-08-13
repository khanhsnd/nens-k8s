package metrics

import (
	"context"
	"fmt"
	"log/slog"

	"nens-k8s/internal/domain"
	"nens-k8s/internal/kube/cluster"

	apierrors "k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/api/resource"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
)

type Clusters interface {
	Connection(id string) (*cluster.Connection, bool)
}

var (
	nodeMetrics = schema.GroupVersionResource{Group: "metrics.k8s.io", Version: "v1beta1", Resource: "nodes"}
	podMetrics  = schema.GroupVersionResource{Group: "metrics.k8s.io", Version: "v1beta1", Resource: "pods"}
)

// Reader answers one poll of metrics.k8s.io. It holds no state: the API cannot
// be watched, so the cadence belongs to whoever is looking, and a cached sample
// would only ever be staler than the one a caller is about to ask for.
type Reader struct {
	clusters Clusters
}

func NewReader(clusters Clusters) *Reader { return &Reader{clusters: clusters} }

func (r *Reader) Sample(ctx context.Context, clusterID string) (domain.MetricsSample, error) {
	conn, ok := r.clusters.Connection(clusterID)
	if !ok {
		return domain.MetricsSample{}, fmt.Errorf("cluster %q is not connected", clusterID)
	}

	nodes, err := conn.Dynamic().Resource(nodeMetrics).List(ctx, metav1.ListOptions{})
	if err != nil {
		return unavailable(clusterID, err), nil
	}
	pods, err := conn.Dynamic().Resource(podMetrics).List(ctx, metav1.ListOptions{})
	if err != nil {
		return unavailable(clusterID, err), nil
	}

	return domain.MetricsSample{
		ClusterID: clusterID,
		Available: true,
		Nodes:     collect(nodes.Items, nodeUsage),
		Pods:      collect(pods.Items, podUsage),
	}, nil
}

// PodSample reads one pod's metrics, container by container. It is a Get rather
// than a filtered list because the detail drawer polls it faster than the tables
// poll the cluster — on a 5k-pod cluster that list is megabytes.
func (r *Reader) PodSample(ctx context.Context, clusterID string, namespace string, name string) (domain.PodUsage, error) {
	conn, ok := r.clusters.Connection(clusterID)
	if !ok {
		return domain.PodUsage{}, fmt.Errorf("cluster %q is not connected", clusterID)
	}

	item, err := conn.Dynamic().Resource(podMetrics).Namespace(namespace).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		slog.Debug("pod metrics unavailable", "cluster", clusterID, "pod", name, "error", err)

		return domain.PodUsage{
			Name:       name,
			Namespace:  namespace,
			Error:      podReason(err),
			Containers: []domain.Usage{},
		}, nil
	}

	timestamp, _, _ := unstructured.NestedString(item.Object, "timestamp")
	window, _, _ := unstructured.NestedString(item.Object, "window")

	return domain.PodUsage{
		Name:       name,
		Namespace:  namespace,
		Available:  true,
		Timestamp:  timestamp,
		Window:     window,
		Containers: containerUsage(*item),
	}, nil
}

// A cluster with no metrics-server is the common case rather than a broken one,
// so the reason travels in the sample and every view renders "—" instead of an
// error banner it can do nothing about.
func unavailable(clusterID string, err error) domain.MetricsSample {
	slog.Debug("metrics unavailable", "cluster", clusterID, "error", err)

	return domain.MetricsSample{
		ClusterID: clusterID,
		Error:     reason(err),
		Nodes:     []domain.Usage{},
		Pods:      []domain.Usage{},
	}
}

func reason(err error) string {
	if apierrors.IsNotFound(err) || apierrors.IsServiceUnavailable(err) {
		return "metrics-server is not available on this cluster"
	}
	return err.Error()
}

// One pod has its own NotFound: metrics-server keeps no sample for a pod that
// has just started, and the cluster-wide sample is what answers "is there a
// metrics-server at all".
func podReason(err error) string {
	if apierrors.IsNotFound(err) {
		return "no sample for this pod yet"
	}
	return reason(err)
}

func collect(items []unstructured.Unstructured, read func(unstructured.Unstructured) domain.Usage) []domain.Usage {
	out := make([]domain.Usage, 0, len(items))
	for i := range items {
		out = append(out, read(items[i]))
	}
	return out
}

func nodeUsage(item unstructured.Unstructured) domain.Usage {
	cpu, memory := amounts(item.Object)
	return domain.Usage{Name: item.GetName(), CPUMilli: cpu, MemoryBytes: memory}
}

// A pod's usage is the sum of its containers': the API reports one entry per
// container and every table here is per pod.
func podUsage(item unstructured.Unstructured) domain.Usage {
	usage := domain.Usage{Name: item.GetName(), Namespace: item.GetNamespace()}

	for _, container := range containerUsage(item) {
		usage.CPUMilli += container.CPUMilli
		usage.MemoryBytes += container.MemoryBytes
	}
	return usage
}

func containerUsage(item unstructured.Unstructured) []domain.Usage {
	entries, _, _ := unstructured.NestedSlice(item.Object, "containers")

	usage := make([]domain.Usage, 0, len(entries))
	for _, entry := range entries {
		container, ok := entry.(map[string]any)
		if !ok {
			continue
		}
		name, _, _ := unstructured.NestedString(container, "name")
		cpu, memory := amounts(container)
		usage = append(usage, domain.Usage{Name: name, CPUMilli: cpu, MemoryBytes: memory})
	}
	return usage
}

func amounts(object map[string]any) (int64, int64) {
	rawCPU, _, _ := unstructured.NestedString(object, "usage", "cpu")
	rawMemory, _, _ := unstructured.NestedString(object, "usage", "memory")

	cpu, memory := quantity(rawCPU), quantity(rawMemory)
	return cpu.MilliValue(), memory.Value()
}

func quantity(value string) resource.Quantity {
	parsed, err := resource.ParseQuantity(value)
	if err != nil {
		return resource.Quantity{}
	}
	return parsed
}
