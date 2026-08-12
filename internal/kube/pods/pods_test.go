package pods

import (
	"context"
	"maps"
	"testing"

	"nens-k8s/internal/domain"
	"nens-k8s/internal/kube/cluster"

	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	dynamicfake "k8s.io/client-go/dynamic/fake"
)

var deploymentGVR = schema.GroupVersionResource{Group: "apps", Version: "v1", Resource: "deployments"}

type clusters struct {
	conn *cluster.Connection
}

func (c clusters) Connection(id string) (*cluster.Connection, bool) {
	return c.conn, id == "test"
}

func object(apiVersion string, kind string, name string, extra map[string]any) *unstructured.Unstructured {
	item := map[string]any{
		"apiVersion": apiVersion,
		"kind":       kind,
		"metadata": map[string]any{
			"name":      name,
			"namespace": "default",
			"uid":       "uid-" + name,
			"labels":    map[string]any{"app": "api"},
		},
	}
	maps.Copy(item, extra)
	return &unstructured.Unstructured{Object: item}
}

func podObject(name string) *unstructured.Unstructured {
	return object("v1", "Pod", name, map[string]any{
		"spec": map[string]any{
			"initContainers": []any{map[string]any{"name": "wait-for-db"}},
			"containers":     []any{map[string]any{"name": "api"}, map[string]any{"name": "sidecar"}},
		},
		"status": map[string]any{
			"phase": "Running",
			"containerStatuses": []any{
				map[string]any{
					"name":         "api",
					"restartCount": int64(3),
					"state":        map[string]any{"running": map[string]any{}},
				},
			},
			"initContainerStatuses": []any{
				map[string]any{
					"name":  "wait-for-db",
					"state": map[string]any{"terminated": map[string]any{"exitCode": int64(0)}},
				},
			},
		},
	})
}

func newResolver(t *testing.T, objects ...runtime.Object) *Resolver {
	t.Helper()

	dyn := dynamicfake.NewSimpleDynamicClientWithCustomListKinds(
		runtime.NewScheme(),
		map[schema.GroupVersionResource]string{
			GVR:           "PodList",
			deploymentGVR: "DeploymentList",
		},
		objects...,
	)

	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)

	conn := cluster.NewConnection(ctx, domain.Cluster{ID: "test"}, cluster.Clients{Dynamic: dyn})
	return NewResolver(clusters{conn: conn})
}

func ref(resource string, name string) domain.ResourceRef {
	gvr := domain.GVR{Version: "v1", Resource: resource}
	if resource == "deployments" {
		gvr = domain.GVR{Group: "apps", Version: "v1", Resource: resource}
	}
	return domain.ResourceRef{ClusterID: "test", GVR: gvr, Namespace: "default", Name: name}
}

func TestTargetsListsEveryContainerOfAPod(t *testing.T) {
	resolver := newResolver(t, podObject("api-1"))

	targets, err := resolver.Targets(context.Background(), ref("pods", "api-1"))
	if err != nil {
		t.Fatal(err)
	}

	want := []domain.ContainerTarget{
		{Namespace: "default", Pod: "api-1", Container: "wait-for-db", Role: domain.ContainerRoleInit, State: "terminated"},
		{Namespace: "default", Pod: "api-1", Container: "api", Role: domain.ContainerRoleApp, State: "running", Restarts: 3},
		{Namespace: "default", Pod: "api-1", Container: "sidecar", Role: domain.ContainerRoleApp},
	}
	if len(targets) != len(want) {
		t.Fatalf("got %d targets, want %d: %+v", len(targets), len(want), targets)
	}
	for i, target := range targets {
		if target != want[i] {
			t.Errorf("target %d = %+v, want %+v", i, target, want[i])
		}
	}
}

func TestTargetsResolvesAWorkloadThroughItsSelector(t *testing.T) {
	deployment := object("apps/v1", "Deployment", "api", map[string]any{
		"spec": map[string]any{
			"selector": map[string]any{"matchLabels": map[string]any{"app": "api"}},
		},
	})
	resolver := newResolver(t, deployment, podObject("api-1"), podObject("api-2"))

	targets, err := resolver.Targets(context.Background(), ref("deployments", "api"))
	if err != nil {
		t.Fatal(err)
	}

	if len(targets) != 6 {
		t.Fatalf("got %d targets, want 6 (2 pods × 3 containers): %+v", len(targets), targets)
	}
}

func TestTargetsFailsWhenNothingSelectsPods(t *testing.T) {
	resolver := newResolver(t, object("v1", "ConfigMap", "settings", nil))

	if _, err := resolver.Targets(context.Background(), ref("configmaps", "settings")); err == nil {
		t.Error("a kind with no pod selector should report an error")
	}
}

func TestTargetsRefusesADisconnectedCluster(t *testing.T) {
	resolver := newResolver(t, podObject("api-1"))

	other := ref("pods", "api-1")
	other.ClusterID = "other"
	if _, err := resolver.Targets(context.Background(), other); err == nil {
		t.Error("resolving targets on a cluster that is not connected should fail")
	}
}
