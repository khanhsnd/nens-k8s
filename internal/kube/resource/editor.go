package resource

import (
	"context"
	"errors"
	"fmt"
	"sort"

	"nens-k8s/internal/domain"
	"nens-k8s/internal/kube/cluster"

	"k8s.io/apimachinery/pkg/api/meta"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/client-go/dynamic"
)

const (
	fieldManager = "nens"
	ownerDepth   = 8
	eventLimit   = 200
)

var eventsGVR = schema.GroupVersionResource{Version: "v1", Resource: "events"}

type Editor struct {
	clusters Clusters
}

func NewEditor(clusters Clusters) *Editor {
	return &Editor{clusters: clusters}
}

func (e *Editor) Get(ctx context.Context, ref domain.ResourceRef) (map[string]any, error) {
	client, _, err := e.client(ref)
	if err != nil {
		return nil, err
	}

	object, err := client.Get(ctx, ref.Name, metav1.GetOptions{})
	if err != nil {
		return nil, err
	}
	return trim(object), nil
}

func (e *Editor) Apply(ctx context.Context, ref domain.ResourceRef, object map[string]any) (map[string]any, error) {
	client, _, err := e.client(ref)
	if err != nil {
		return nil, err
	}

	applied, err := client.Apply(ctx, ref.Name, &unstructured.Unstructured{Object: object}, metav1.ApplyOptions{
		FieldManager: fieldManager,
		Force:        true,
	})
	if err != nil {
		return nil, err
	}
	return trim(applied), nil
}

func (e *Editor) Delete(ctx context.Context, ref domain.ResourceRef) error {
	client, _, err := e.client(ref)
	if err != nil {
		return err
	}
	return client.Delete(ctx, ref.Name, metav1.DeleteOptions{})
}

func (e *Editor) Scale(ctx context.Context, ref domain.ResourceRef, replicas int32) error {
	client, _, err := e.client(ref)
	if err != nil {
		return err
	}

	patch := fmt.Appendf(nil, `{"spec":{"replicas":%d}}`, replicas)
	_, err = client.Patch(ctx, ref.Name, types.MergePatchType, patch, metav1.PatchOptions{
		FieldManager: fieldManager,
	}, "scale")
	return err
}

func (e *Editor) Owners(ctx context.Context, ref domain.ResourceRef) ([]domain.OwnerRef, error) {
	client, conn, err := e.client(ref)
	if err != nil {
		return nil, err
	}

	object, err := client.Get(ctx, ref.Name, metav1.GetOptions{})
	if err != nil {
		return nil, err
	}

	chain := make([]domain.OwnerRef, 0, 2)
	seen := make(map[types.UID]bool)

	for range ownerDepth {
		owner := controllerOf(object)
		if owner == nil || seen[owner.UID] {
			break
		}
		seen[owner.UID] = true

		mapping, err := mappingFor(conn, *owner)
		if err != nil {
			break
		}

		namespace := ""
		if mapping.Scope.Name() == meta.RESTScopeNameNamespace {
			namespace = object.GetNamespace()
		}
		chain = append(chain, domain.OwnerRef{
			GVR:       domainGVR(mapping.Resource),
			Kind:      owner.Kind,
			Name:      owner.Name,
			Namespace: namespace,
			UID:       string(owner.UID),
		})

		parent, err := conn.Dynamic().Resource(mapping.Resource).Namespace(namespace).
			Get(ctx, owner.Name, metav1.GetOptions{})
		if err != nil {
			break
		}
		object = parent
	}

	return chain, nil
}

func (e *Editor) Events(ctx context.Context, ref domain.ResourceRef) ([]domain.EventRecord, error) {
	if ref.UID == "" {
		return nil, errors.New("events need the uid of the involved object")
	}

	conn, ok := e.clusters.Connection(ref.ClusterID)
	if !ok {
		return nil, fmt.Errorf("cluster %q is not connected", ref.ClusterID)
	}

	list, err := conn.Dynamic().Resource(eventsGVR).Namespace(ref.Namespace).List(ctx, metav1.ListOptions{
		FieldSelector: "involvedObject.uid=" + ref.UID,
		Limit:         eventLimit,
	})
	if err != nil {
		return nil, err
	}

	records := make([]domain.EventRecord, 0, len(list.Items))
	for _, item := range list.Items {
		records = append(records, eventRecord(item.Object))
	}
	sort.Slice(records, func(a, b int) bool { return records[a].Last > records[b].Last })
	return records, nil
}

func (e *Editor) client(ref domain.ResourceRef) (dynamic.ResourceInterface, *cluster.Connection, error) {
	conn, ok := e.clusters.Connection(ref.ClusterID)
	if !ok {
		return nil, nil, fmt.Errorf("cluster %q is not connected", ref.ClusterID)
	}
	return conn.Dynamic().Resource(schemaGVR(ref.GVR)).Namespace(ref.Namespace), conn, nil
}

func mappingFor(conn *cluster.Connection, owner metav1.OwnerReference) (*meta.RESTMapping, error) {
	gv, err := schema.ParseGroupVersion(owner.APIVersion)
	if err != nil {
		return nil, err
	}
	return conn.Mapper().RESTMapping(schema.GroupKind{Group: gv.Group, Kind: owner.Kind}, gv.Version)
}

func controllerOf(object *unstructured.Unstructured) *metav1.OwnerReference {
	owners := object.GetOwnerReferences()
	for i := range owners {
		if owners[i].Controller != nil && *owners[i].Controller {
			return &owners[i]
		}
	}
	if len(owners) > 0 {
		return &owners[0]
	}
	return nil
}

func eventRecord(object map[string]any) domain.EventRecord {
	text := func(path ...string) string {
		value, _, _ := unstructured.NestedString(object, path...)
		return value
	}
	first := func(paths ...[]string) string {
		for _, path := range paths {
			if value := text(path...); value != "" {
				return value
			}
		}
		return ""
	}

	count, _, _ := unstructured.NestedInt64(object, "count")
	return domain.EventRecord{
		Type:    text("type"),
		Reason:  text("reason"),
		Message: text("message"),
		Source:  first([]string{"source", "component"}, []string{"reportingComponent"}),
		Count:   max(count, 1),
		Last: first(
			[]string{"lastTimestamp"},
			[]string{"series", "lastObservedTime"},
			[]string{"eventTime"},
			[]string{"metadata", "creationTimestamp"},
		),
	}
}

func schemaGVR(gvr domain.GVR) schema.GroupVersionResource {
	return schema.GroupVersionResource{Group: gvr.Group, Version: gvr.Version, Resource: gvr.Resource}
}

func domainGVR(gvr schema.GroupVersionResource) domain.GVR {
	return domain.GVR{Group: gvr.Group, Version: gvr.Version, Resource: gvr.Resource}
}
