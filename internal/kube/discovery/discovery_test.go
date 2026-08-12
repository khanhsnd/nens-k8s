package discovery

import (
	"context"
	"errors"
	"testing"
	"time"

	"nens-k8s/internal/domain"
	"nens-k8s/internal/kube/cluster"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	k8sdiscovery "k8s.io/client-go/discovery"
	dynamicfake "k8s.io/client-go/dynamic/fake"
	k8stesting "k8s.io/client-go/testing"
)

// The fake clientset's discovery answers ServerPreferredResources with nothing,
// so the served API surface is scripted here instead. Everything the adapter
// never calls is left to the embedded nil interface.
type fakeDiscovery struct {
	k8sdiscovery.DiscoveryInterface
	lists       []*metav1.APIResourceList
	err         error
	calls       int
	invalidated int
}

func (f *fakeDiscovery) ServerPreferredResources() ([]*metav1.APIResourceList, error) {
	f.calls++
	return f.lists, f.err
}

func (f *fakeDiscovery) Fresh() bool { return true }

func (f *fakeDiscovery) Invalidate() { f.invalidated++ }

type clusters struct {
	conn *cluster.Connection
}

func (c clusters) Connection(id string) (*cluster.Connection, bool) {
	return c.conn, id == "test"
}

type harness struct {
	cache   *Cache
	api     *fakeDiscovery
	dynamic *dynamicfake.FakeDynamicClient
	close   context.CancelFunc
}

func resourceList(groupVersion string, resources ...metav1.APIResource) *metav1.APIResourceList {
	return &metav1.APIResourceList{GroupVersion: groupVersion, APIResources: resources}
}

func served(name string, kind string, namespaced bool) metav1.APIResource {
	return metav1.APIResource{
		Name:       name,
		Kind:       kind,
		Namespaced: namespaced,
		Verbs:      []string{"get", "list", "watch"},
	}
}

func crd(group string, plural string, version string, columns ...any) *unstructured.Unstructured {
	return &unstructured.Unstructured{Object: map[string]any{
		"apiVersion": "apiextensions.k8s.io/v1",
		"kind":       "CustomResourceDefinition",
		"metadata":   map[string]any{"name": plural + "." + group},
		"spec": map[string]any{
			"group": group,
			"names": map[string]any{"plural": plural, "kind": "Certificate"},
			"versions": []any{
				map[string]any{"name": version, "additionalPrinterColumns": columns},
			},
		},
	}}
}

func newCache(t *testing.T, lists []*metav1.APIResourceList, crds ...runtime.Object) harness {
	t.Helper()

	client := dynamicfake.NewSimpleDynamicClientWithCustomListKinds(
		runtime.NewScheme(),
		map[schema.GroupVersionResource]string{crdGVR: "CustomResourceDefinitionList"},
		crds...,
	)

	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)

	api := &fakeDiscovery{lists: lists}
	conn := cluster.NewConnection(ctx, domain.Cluster{ID: "test"}, cluster.Clients{
		Dynamic:   client,
		Discovery: api,
	})
	return harness{cache: NewCache(clusters{conn: conn}), api: api, dynamic: client, close: cancel}
}

func find(t *testing.T, resources []domain.APIResource, resource string) domain.APIResource {
	t.Helper()

	for _, item := range resources {
		if item.GVR.Resource == resource {
			return item
		}
	}
	t.Fatalf("%s is missing from %+v", resource, resources)
	return domain.APIResource{}
}

func TestResourcesDropSubresourcesAndAnythingThatCannotBeWatched(t *testing.T) {
	h := newCache(t, []*metav1.APIResourceList{
		resourceList("v1",
			served("pods", "Pod", true),
			metav1.APIResource{Name: "pods/log", Kind: "Pod", Verbs: []string{"get", "list", "watch"}},
			metav1.APIResource{Name: "componentstatuses", Kind: "ComponentStatus", Verbs: []string{"get", "list"}},
		),
	})

	resources, err := h.cache.Resources(context.Background(), "test")
	if err != nil {
		t.Fatalf("Resources: %v", err)
	}
	if len(resources) != 1 || resources[0].GVR.Resource != "pods" {
		t.Fatalf("expected only pods, got %+v", resources)
	}
	if !resources[0].Namespaced || resources[0].Kind != "Pod" {
		t.Fatalf("pods lost its scope or kind: %+v", resources[0])
	}
}

func TestResourcesMarkAnythingOutsideTheBuiltinGroupsAsCustom(t *testing.T) {
	h := newCache(t, []*metav1.APIResourceList{
		resourceList("v1", served("pods", "Pod", true)),
		resourceList("networking.k8s.io/v1", served("ingresses", "Ingress", true)),
		resourceList("cert-manager.io/v1", served("certificates", "Certificate", true)),
	})

	resources, err := h.cache.Resources(context.Background(), "test")
	if err != nil {
		t.Fatalf("Resources: %v", err)
	}

	for _, want := range []struct {
		resource string
		custom   bool
	}{{"pods", false}, {"ingresses", false}, {"certificates", true}} {
		if item := find(t, resources, want.resource); item.Custom != want.custom {
			t.Errorf("%s: custom = %v, want %v", want.resource, item.Custom, want.custom)
		}
	}
}

func TestResourcesCarryThePrinterColumnsOfTheServedCRDVersion(t *testing.T) {
	h := newCache(t,
		[]*metav1.APIResourceList{
			resourceList("cert-manager.io/v1", served("certificates", "Certificate", true)),
		},
		crd("cert-manager.io", "certificates", "v1",
			map[string]any{"name": "Ready", "type": "string", "jsonPath": ".status.conditions[0].status"},
			map[string]any{"name": "Issuer", "type": "string", "jsonPath": ".spec.issuerRef.name", "priority": int64(1)},
			map[string]any{"name": "no path", "type": "string"},
		),
	)

	resources, err := h.cache.Resources(context.Background(), "test")
	if err != nil {
		t.Fatalf("Resources: %v", err)
	}

	columns := find(t, resources, "certificates").Columns
	if len(columns) != 2 {
		t.Fatalf("expected the two columns that have a jsonPath, got %+v", columns)
	}
	if columns[0].Name != "Ready" || columns[0].JSONPath != ".status.conditions[0].status" {
		t.Errorf("first column = %+v", columns[0])
	}
	if columns[1].Priority != 1 {
		t.Errorf("the wide column lost its priority: %+v", columns[1])
	}
}

func TestResourcesOnlyMatchThePrinterColumnsOfTheirOwnVersion(t *testing.T) {
	h := newCache(t,
		[]*metav1.APIResourceList{
			resourceList("cert-manager.io/v1", served("certificates", "Certificate", true)),
		},
		crd("cert-manager.io", "certificates", "v1alpha1",
			map[string]any{"name": "Stale", "type": "string", "jsonPath": ".status.stale"},
		),
	)

	resources, err := h.cache.Resources(context.Background(), "test")
	if err != nil {
		t.Fatalf("Resources: %v", err)
	}
	if columns := find(t, resources, "certificates").Columns; len(columns) != 0 {
		t.Fatalf("v1 must not inherit v1alpha1's columns: %+v", columns)
	}
}

func TestCustomResourcesSurviveBeingUnableToReadTheCRDs(t *testing.T) {
	h := newCache(t, []*metav1.APIResourceList{
		resourceList("cert-manager.io/v1", served("certificates", "Certificate", true)),
	})
	h.dynamic.PrependReactor("list", "customresourcedefinitions",
		func(k8stesting.Action) (bool, runtime.Object, error) {
			return true, nil, errors.New("customresourcedefinitions is forbidden")
		})

	resources, err := h.cache.Resources(context.Background(), "test")
	if err != nil {
		t.Fatalf("Resources: %v", err)
	}
	if certificates := find(t, resources, "certificates"); !certificates.Custom || len(certificates.Columns) != 0 {
		t.Fatalf("expected a custom kind with no columns, got %+v", certificates)
	}
}

func TestResourcesKeepAPartialDiscoveryAnswer(t *testing.T) {
	h := newCache(t, []*metav1.APIResourceList{
		resourceList("v1", served("pods", "Pod", true)),
	})
	h.api.err = errors.New("unable to retrieve the complete list of server APIs: metrics.k8s.io/v1beta1")

	resources, err := h.cache.Resources(context.Background(), "test")
	if err != nil {
		t.Fatalf("a partial answer must not fail: %v", err)
	}
	if len(resources) != 1 {
		t.Fatalf("expected the healthy group, got %+v", resources)
	}
}

func TestResourcesFailWhenDiscoveryAnswersNothing(t *testing.T) {
	h := newCache(t, nil)
	h.api.err = errors.New("connection refused")

	if _, err := h.cache.Resources(context.Background(), "test"); err == nil {
		t.Fatal("expected the discovery error to surface")
	}
}

func TestResourcesAreDiscoveredOncePerConnection(t *testing.T) {
	h := newCache(t, []*metav1.APIResourceList{
		resourceList("v1", served("pods", "Pod", true)),
	})
	ctx := context.Background()

	for range 3 {
		if _, err := h.cache.Resources(ctx, "test"); err != nil {
			t.Fatalf("Resources: %v", err)
		}
	}
	if h.api.calls != 1 {
		t.Fatalf("discovery ran %d times, want 1", h.api.calls)
	}

	if _, err := h.cache.Refresh(ctx, "test"); err != nil {
		t.Fatalf("Refresh: %v", err)
	}
	if h.api.invalidated != 1 || h.api.calls != 2 {
		t.Fatalf("Refresh invalidated %d times and ran discovery %d times", h.api.invalidated, h.api.calls)
	}
}

func TestTheCachedResourcesDieWithTheConnection(t *testing.T) {
	h := newCache(t, []*metav1.APIResourceList{
		resourceList("v1", served("pods", "Pod", true)),
	})
	ctx := context.Background()

	if _, err := h.cache.Resources(ctx, "test"); err != nil {
		t.Fatalf("Resources: %v", err)
	}
	h.close()

	// Eviction runs on a goroutine woken by the connection's context, so the
	// next call has to be retried until it misses the cache.
	for range 200 {
		if _, err := h.cache.Resources(ctx, "test"); err != nil {
			t.Fatalf("Resources: %v", err)
		}
		if h.api.calls == 2 {
			return
		}
		time.Sleep(time.Millisecond)
	}
	t.Fatal("the cache entry outlived its connection")
}

func TestResourcesFailForAClusterThatIsNotConnected(t *testing.T) {
	h := newCache(t, nil)

	if _, err := h.cache.Resources(context.Background(), "other"); err == nil {
		t.Fatal("expected an error for an unknown cluster")
	}
	if _, err := h.cache.Refresh(context.Background(), "other"); err == nil {
		t.Fatal("expected an error for an unknown cluster")
	}
}
