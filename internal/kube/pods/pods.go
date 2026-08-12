package pods

import (
	"context"
	"fmt"

	"nens-k8s/internal/domain"
	"nens-k8s/internal/kube/cluster"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/labels"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
)

const limit = 200

var GVR = schema.GroupVersionResource{Version: "v1", Resource: "pods"}

type Clusters interface {
	Connection(id string) (*cluster.Connection, bool)
}

type Resolver struct {
	clusters Clusters
}

func NewResolver(clusters Clusters) *Resolver {
	return &Resolver{clusters: clusters}
}

// Targets resolves anything that owns pods — a pod, a workload with a
// LabelSelector, a service — into the containers a stream can attach to.
func (r *Resolver) Targets(ctx context.Context, ref domain.ResourceRef) ([]domain.ContainerTarget, error) {
	conn, ok := r.clusters.Connection(ref.ClusterID)
	if !ok {
		return nil, fmt.Errorf("cluster %q is not connected", ref.ClusterID)
	}

	found, err := Selected(ctx, conn, ref)
	if err != nil {
		return nil, err
	}

	targets := make([]domain.ContainerTarget, 0, len(found))
	for i := range found {
		targets = append(targets, containersOf(&found[i])...)
	}
	return targets, nil
}

func Get(ctx context.Context, conn *cluster.Connection, ref domain.ResourceRef) (*unstructured.Unstructured, error) {
	return conn.Dynamic().Resource(SchemaGVR(ref.GVR)).Namespace(ref.Namespace).
		Get(ctx, ref.Name, metav1.GetOptions{})
}

// Selected is the pod itself when ref points at one, and whatever its selector
// matches otherwise.
func Selected(ctx context.Context, conn *cluster.Connection, ref domain.ResourceRef) ([]unstructured.Unstructured, error) {
	object, err := Get(ctx, conn, ref)
	if err != nil {
		return nil, err
	}
	if SchemaGVR(ref.GVR) == GVR {
		return []unstructured.Unstructured{*object}, nil
	}

	selector, err := selectorOf(object)
	if err != nil {
		return nil, err
	}

	list, err := conn.Dynamic().Resource(GVR).Namespace(ref.Namespace).
		List(ctx, metav1.ListOptions{LabelSelector: selector, Limit: limit})
	if err != nil {
		return nil, err
	}
	return list.Items, nil
}

func SchemaGVR(gvr domain.GVR) schema.GroupVersionResource {
	return schema.GroupVersionResource{Group: gvr.Group, Version: gvr.Version, Resource: gvr.Resource}
}

var containerGroups = []struct {
	path []string
	role string
}{
	{[]string{"spec", "initContainers"}, domain.ContainerRoleInit},
	{[]string{"spec", "containers"}, domain.ContainerRoleApp},
	{[]string{"spec", "ephemeralContainers"}, domain.ContainerRoleEphemeral},
}

var statusPaths = [][]string{
	{"status", "initContainerStatuses"},
	{"status", "containerStatuses"},
	{"status", "ephemeralContainerStatuses"},
}

func containersOf(pod *unstructured.Unstructured) []domain.ContainerTarget {
	states := containerStates(pod)
	targets := make([]domain.ContainerTarget, 0, 4)

	for _, group := range containerGroups {
		items, _, _ := unstructured.NestedSlice(pod.Object, group.path...)
		for _, item := range items {
			container, _ := item.(map[string]any)
			name, _ := container["name"].(string)
			if name == "" {
				continue
			}

			state := states[name]
			targets = append(targets, domain.ContainerTarget{
				Namespace: pod.GetNamespace(),
				Pod:       pod.GetName(),
				Container: name,
				Role:      group.role,
				State:     state.phase,
				Restarts:  state.restarts,
			})
		}
	}
	return targets
}

type containerState struct {
	phase    string
	restarts int64
}

func containerStates(pod *unstructured.Unstructured) map[string]containerState {
	states := make(map[string]containerState)

	for _, path := range statusPaths {
		items, _, _ := unstructured.NestedSlice(pod.Object, path...)
		for _, item := range items {
			status, _ := item.(map[string]any)
			name, _ := status["name"].(string)
			if name == "" {
				continue
			}

			restarts, _, _ := unstructured.NestedInt64(status, "restartCount")
			states[name] = containerState{phase: phaseOf(status), restarts: restarts}
		}
	}
	return states
}

func phaseOf(status map[string]any) string {
	state, _, _ := unstructured.NestedMap(status, "state")
	for _, phase := range []string{"running", "terminated", "waiting"} {
		if _, found := state[phase]; found {
			return phase
		}
	}
	return ""
}

// selectorOf reads either a LabelSelector (workloads) or a plain label map (services).
func selectorOf(object *unstructured.Unstructured) (string, error) {
	raw, found, err := unstructured.NestedMap(object.Object, "spec", "selector")
	if err != nil || !found || len(raw) == 0 {
		return "", fmt.Errorf("%s %q selects no pods", object.GetKind(), object.GetName())
	}

	if raw["matchLabels"] == nil && raw["matchExpressions"] == nil {
		plain, _, err := unstructured.NestedStringMap(object.Object, "spec", "selector")
		if err != nil {
			return "", err
		}
		return labels.Set(plain).String(), nil
	}

	selector := &metav1.LabelSelector{}
	if err := runtime.DefaultUnstructuredConverter.FromUnstructured(raw, selector); err != nil {
		return "", err
	}
	parsed, err := metav1.LabelSelectorAsSelector(selector)
	if err != nil {
		return "", err
	}
	return parsed.String(), nil
}
