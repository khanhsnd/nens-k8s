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
// container and every view here is per pod.
func podUsage(item unstructured.Unstructured) domain.Usage {
	usage := domain.Usage{Name: item.GetName(), Namespace: item.GetNamespace()}

	containers, _, _ := unstructured.NestedSlice(item.Object, "containers")
	for _, entry := range containers {
		container, ok := entry.(map[string]any)
		if !ok {
			continue
		}
		cpu, memory := amounts(container)
		usage.CPUMilli += cpu
		usage.MemoryBytes += memory
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
