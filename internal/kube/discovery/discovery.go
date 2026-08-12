package discovery

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"sync"

	"nens-k8s/internal/domain"
	"nens-k8s/internal/kube/cluster"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
)

type Clusters interface {
	Connection(id string) (*cluster.Connection, bool)
}

var crdGVR = schema.GroupVersionResource{
	Group:    "apiextensions.k8s.io",
	Version:  "v1",
	Resource: "customresourcedefinitions",
}

// Everything outside these groups is an extension of the cluster — a CRD or an
// aggregated API — and lands under Custom Resources. Deriving that from the
// group needs no permission on `customresourcedefinitions`, which reading the
// printer columns does.
var builtinGroups = map[string]bool{
	"":                             true,
	"admissionregistration.k8s.io": true,
	"apiextensions.k8s.io":         true,
	"apiregistration.k8s.io":       true,
	"apps":                         true,
	"authentication.k8s.io":        true,
	"authorization.k8s.io":         true,
	"autoscaling":                  true,
	"batch":                        true,
	"certificates.k8s.io":          true,
	"coordination.k8s.io":          true,
	"discovery.k8s.io":             true,
	"events.k8s.io":                true,
	"flowcontrol.apiserver.k8s.io": true,
	"internal.apiserver.k8s.io":    true,
	"metrics.k8s.io":               true,
	"networking.k8s.io":            true,
	"node.k8s.io":                  true,
	"policy":                       true,
	"rbac.authorization.k8s.io":    true,
	"resource.k8s.io":              true,
	"scheduling.k8s.io":            true,
	"storage.k8s.io":               true,
	"storagemigration.k8s.io":      true,
}

type entry struct {
	resources []domain.APIResource
}

// Cache answers "what does this cluster serve" once per connection. The entry
// dies with the connection, so a reconnect rediscovers.
type Cache struct {
	clusters Clusters

	mu      sync.Mutex
	entries map[string]*entry
}

func NewCache(clusters Clusters) *Cache {
	return &Cache{clusters: clusters, entries: make(map[string]*entry)}
}

func (c *Cache) Resources(ctx context.Context, clusterID string) ([]domain.APIResource, error) {
	c.mu.Lock()
	cached, ok := c.entries[clusterID]
	var resources []domain.APIResource
	if ok {
		resources = cached.resources
	}
	c.mu.Unlock()

	if ok {
		return resources, nil
	}
	return c.build(ctx, clusterID)
}

// Refresh drops the discovery client's own cache too — a CRD installed while
// the app was running is invisible until both are cleared.
func (c *Cache) Refresh(ctx context.Context, clusterID string) ([]domain.APIResource, error) {
	conn, ok := c.clusters.Connection(clusterID)
	if !ok {
		return nil, fmt.Errorf("cluster %q is not connected", clusterID)
	}
	conn.Discovery().Invalidate()
	return c.build(ctx, clusterID)
}

func (c *Cache) build(ctx context.Context, clusterID string) ([]domain.APIResource, error) {
	conn, ok := c.clusters.Connection(clusterID)
	if !ok {
		return nil, fmt.Errorf("cluster %q is not connected", clusterID)
	}

	// One unreachable aggregated API — a dead metrics-server is the usual one —
	// fails the whole call while still returning every healthy group, so a
	// partial answer is kept rather than discarded.
	lists, err := conn.Discovery().ServerPreferredResources()
	if len(lists) == 0 && err != nil {
		return nil, err
	}

	resources := collect(lists, printerColumns(ctx, conn))
	c.store(clusterID, conn, resources)
	return resources, nil
}

func (c *Cache) store(clusterID string, conn *cluster.Connection, resources []domain.APIResource) {
	c.mu.Lock()
	defer c.mu.Unlock()

	if existing, ok := c.entries[clusterID]; ok {
		existing.resources = resources
		return
	}

	fresh := &entry{resources: resources}
	c.entries[clusterID] = fresh

	go func() {
		<-conn.Context().Done()
		c.drop(clusterID, fresh)
	}()
}

func (c *Cache) drop(clusterID string, dead *entry) {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.entries[clusterID] == dead {
		delete(c.entries, clusterID)
	}
}

// collect keeps only what a table can actually open: no subresources, and both
// list and watch, because every leaf the frontend shows becomes an informer.
func collect(lists []*metav1.APIResourceList, columns map[schema.GroupVersionResource][]domain.PrinterColumn) []domain.APIResource {
	resources := make([]domain.APIResource, 0, 64)
	seen := make(map[schema.GroupVersionResource]bool)

	for _, list := range lists {
		if list == nil {
			continue
		}
		gv, err := schema.ParseGroupVersion(list.GroupVersion)
		if err != nil {
			continue
		}

		for _, item := range list.APIResources {
			if strings.Contains(item.Name, "/") || !watchable(item.Verbs) {
				continue
			}

			gvr := schema.GroupVersionResource{Group: gv.Group, Version: gv.Version, Resource: item.Name}
			if seen[gvr] {
				continue
			}
			seen[gvr] = true

			resources = append(resources, domain.APIResource{
				GVR:        domain.GVR{Group: gvr.Group, Version: gvr.Version, Resource: gvr.Resource},
				Kind:       item.Kind,
				Namespaced: item.Namespaced,
				Custom:     !builtinGroups[gvr.Group],
				Verbs:      item.Verbs,
				ShortNames: item.ShortNames,
				Columns:    columns[gvr],
			})
		}
	}

	sort.Slice(resources, func(a, b int) bool {
		if resources[a].GVR.Group != resources[b].GVR.Group {
			return resources[a].GVR.Group < resources[b].GVR.Group
		}
		return resources[a].GVR.Resource < resources[b].GVR.Resource
	})
	return resources
}

func watchable(verbs []string) bool {
	var list, watch bool
	for _, verb := range verbs {
		list = list || verb == "list"
		watch = watch || verb == "watch"
	}
	return list && watch
}

// printerColumns is a best effort: without permission on CRDs the custom kinds
// still show up, they just fall back to the generic Name/Namespace/Age columns.
func printerColumns(ctx context.Context, conn *cluster.Connection) map[schema.GroupVersionResource][]domain.PrinterColumn {
	list, err := conn.Dynamic().Resource(crdGVR).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil
	}

	columns := make(map[schema.GroupVersionResource][]domain.PrinterColumn)
	for _, crd := range list.Items {
		group, _, _ := unstructured.NestedString(crd.Object, "spec", "group")
		plural, _, _ := unstructured.NestedString(crd.Object, "spec", "names", "plural")
		versions, _, _ := unstructured.NestedSlice(crd.Object, "spec", "versions")

		for _, item := range versions {
			version, ok := item.(map[string]any)
			if !ok {
				continue
			}
			name, _, _ := unstructured.NestedString(version, "name")
			raw, _, _ := unstructured.NestedSlice(version, "additionalPrinterColumns")
			printers := printers(raw)
			if name == "" || len(printers) == 0 {
				continue
			}
			columns[schema.GroupVersionResource{Group: group, Version: name, Resource: plural}] = printers
		}
	}
	return columns
}

func printers(raw []any) []domain.PrinterColumn {
	columns := make([]domain.PrinterColumn, 0, len(raw))
	for _, item := range raw {
		object, ok := item.(map[string]any)
		if !ok {
			continue
		}
		name, _, _ := unstructured.NestedString(object, "name")
		path, _, _ := unstructured.NestedString(object, "jsonPath")
		if name == "" || path == "" {
			continue
		}

		kind, _, _ := unstructured.NestedString(object, "type")
		priority, _, _ := unstructured.NestedInt64(object, "priority")
		description, _, _ := unstructured.NestedString(object, "description")
		columns = append(columns, domain.PrinterColumn{
			Name:        name,
			Type:        kind,
			JSONPath:    path,
			Priority:    int32(priority),
			Description: description,
		})
	}
	return columns
}
