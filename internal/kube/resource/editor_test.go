package resource

import (
	"context"
	"maps"
	"strings"
	"testing"

	"nens-k8s/internal/domain"
	"nens-k8s/internal/kube/cluster"

	apimeta "k8s.io/apimachinery/pkg/api/meta"

	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/apimachinery/pkg/types"
	dynamicfake "k8s.io/client-go/dynamic/fake"
	k8stesting "k8s.io/client-go/testing"
)

var (
	replicaSetGVR = schema.GroupVersionResource{Group: "apps", Version: "v1", Resource: "replicasets"}
	deploymentGVR = schema.GroupVersionResource{Group: "apps", Version: "v1", Resource: "deployments"}
)

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
			"managedFields": []any{
				map[string]any{"manager": "kubectl", "operation": "Apply"},
			},
		},
	}
	maps.Copy(item, extra)
	return &unstructured.Unstructured{Object: item}
}

func ownerReferences(kind string, name string) []any {
	return []any{map[string]any{
		"apiVersion": "apps/v1",
		"kind":       kind,
		"name":       name,
		"uid":        "uid-" + name,
		"controller": true,
	}}
}

func newEditor(t *testing.T, objects ...runtime.Object) (*Editor, *dynamicfake.FakeDynamicClient) {
	t.Helper()

	client := dynamicfake.NewSimpleDynamicClientWithCustomListKinds(
		runtime.NewScheme(),
		map[schema.GroupVersionResource]string{
			podGVR:        "PodList",
			replicaSetGVR: "ReplicaSetList",
			deploymentGVR: "DeploymentList",
			eventsGVR:     "EventList",
		},
		objects...,
	)

	mapper := apimeta.NewDefaultRESTMapper(nil)
	mapper.AddSpecific(
		schema.GroupVersionKind{Group: "apps", Version: "v1", Kind: "ReplicaSet"},
		replicaSetGVR, replicaSetGVR, apimeta.RESTScopeNamespace,
	)
	mapper.AddSpecific(
		schema.GroupVersionKind{Group: "apps", Version: "v1", Kind: "Deployment"},
		deploymentGVR, deploymentGVR, apimeta.RESTScopeNamespace,
	)

	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)

	conn := cluster.NewConnection(ctx, domain.Cluster{ID: "test"}, client, mapper)
	return NewEditor(clusters{conn: conn}), client
}

func podRef(name string) domain.ResourceRef {
	return domain.ResourceRef{
		ClusterID: "test",
		GVR:       domain.GVR{Version: "v1", Resource: "pods"},
		Namespace: "default",
		Name:      name,
		UID:       "uid-" + name,
	}
}

func TestGetTrimsManagedFields(t *testing.T) {
	editor, _ := newEditor(t, pod("alpha"))

	object, err := editor.Get(context.Background(), podRef("alpha"))
	if err != nil {
		t.Fatal(err)
	}

	metadata := object["metadata"].(map[string]any)
	if _, found := metadata["managedFields"]; found {
		t.Error("managedFields should be trimmed off the payload")
	}
}

func TestGetRejectsUnknownCluster(t *testing.T) {
	editor, _ := newEditor(t, pod("alpha"))

	ref := podRef("alpha")
	ref.ClusterID = "other"
	if _, err := editor.Get(context.Background(), ref); err == nil {
		t.Error("expected an error for a cluster that is not connected")
	}
}

func TestDeleteRemovesTheObject(t *testing.T) {
	editor, _ := newEditor(t, pod("alpha"))

	if err := editor.Delete(context.Background(), podRef("alpha")); err != nil {
		t.Fatal(err)
	}
	if _, err := editor.Get(context.Background(), podRef("alpha")); err == nil {
		t.Error("the pod should be gone after Delete")
	}
}

func TestApplySendsTheEditedObjectAsAnApplyPatch(t *testing.T) {
	editor, client := newEditor(t, pod("alpha"))

	var patch k8stesting.PatchAction
	client.PrependReactor("patch", "pods", func(action k8stesting.Action) (bool, runtime.Object, error) {
		patch = action.(k8stesting.PatchAction)
		return true, pod("alpha"), nil
	})

	edited := map[string]any{
		"apiVersion": "v1",
		"kind":       "Pod",
		"metadata": map[string]any{
			"name":      "alpha",
			"namespace": "default",
			"labels":    map[string]any{"tier": "edge"},
		},
	}
	if _, err := editor.Apply(context.Background(), podRef("alpha"), edited); err != nil {
		t.Fatal(err)
	}

	if patch == nil || patch.GetPatchType() != types.ApplyPatchType {
		t.Fatalf("expected a server-side apply patch, got %+v", patch)
	}
	if !strings.Contains(string(patch.GetPatch()), `"tier":"edge"`) {
		t.Errorf("patch body lost the edit: %s", patch.GetPatch())
	}
}

func TestScaleSetsReplicas(t *testing.T) {
	deployment := object("apps/v1", "Deployment", "alpha-deploy", map[string]any{
		"spec": map[string]any{"replicas": int64(1)},
	})
	editor, _ := newEditor(t, deployment)

	ref := domain.ResourceRef{
		ClusterID: "test",
		GVR:       domain.GVR{Group: "apps", Version: "v1", Resource: "deployments"},
		Namespace: "default",
		Name:      "alpha-deploy",
	}
	if err := editor.Scale(context.Background(), ref, 4); err != nil {
		t.Fatal(err)
	}

	stored, err := editor.Get(context.Background(), ref)
	if err != nil {
		t.Fatal(err)
	}
	if replicas := stored["spec"].(map[string]any)["replicas"]; replicas != int64(4) {
		t.Errorf("replicas = %v, want 4", replicas)
	}
}

func TestOwnersWalkTheControllerChain(t *testing.T) {
	pod := object("v1", "Pod", "alpha", nil)
	pod.Object["metadata"].(map[string]any)["ownerReferences"] = ownerReferences("ReplicaSet", "alpha-rs")

	replicaSet := object("apps/v1", "ReplicaSet", "alpha-rs", nil)
	replicaSet.Object["metadata"].(map[string]any)["ownerReferences"] = ownerReferences("Deployment", "alpha-deploy")

	editor, _ := newEditor(t, pod, replicaSet, object("apps/v1", "Deployment", "alpha-deploy", nil))

	chain, err := editor.Owners(context.Background(), podRef("alpha"))
	if err != nil {
		t.Fatal(err)
	}
	if len(chain) != 2 {
		t.Fatalf("expected replicaset → deployment, got %+v", chain)
	}
	if chain[0].Kind != "ReplicaSet" || chain[0].GVR.Resource != "replicasets" {
		t.Errorf("first owner = %+v", chain[0])
	}
	if chain[1].Kind != "Deployment" || chain[1].Name != "alpha-deploy" {
		t.Errorf("second owner = %+v", chain[1])
	}
}

func TestOwnersStopsAtAnUnreadableParent(t *testing.T) {
	pod := object("v1", "Pod", "alpha", nil)
	pod.Object["metadata"].(map[string]any)["ownerReferences"] = ownerReferences("ReplicaSet", "missing-rs")

	editor, _ := newEditor(t, pod)

	chain, err := editor.Owners(context.Background(), podRef("alpha"))
	if err != nil {
		t.Fatal(err)
	}
	if len(chain) != 1 || chain[0].Name != "missing-rs" {
		t.Fatalf("the reference itself should still be reported, got %+v", chain)
	}
}

func TestEventsAreNewestFirst(t *testing.T) {
	editor, _ := newEditor(t,
		eventObject("older", "Normal", "2026-01-01T10:00:00Z"),
		eventObject("newer", "Warning", "2026-01-02T10:00:00Z"),
	)

	records, err := editor.Events(context.Background(), podRef("alpha"))
	if err != nil {
		t.Fatal(err)
	}
	if len(records) != 2 {
		t.Fatalf("expected 2 events, got %d", len(records))
	}
	if records[0].Reason != "newer" || records[0].Type != "Warning" {
		t.Errorf("first record = %+v", records[0])
	}
	if records[0].Count != 1 {
		t.Errorf("count should default to 1, got %d", records[0].Count)
	}
	if records[0].Source != "kubelet" {
		t.Errorf("source = %q, want kubelet", records[0].Source)
	}
}

func TestEventsNeedAUID(t *testing.T) {
	editor, _ := newEditor(t)

	ref := podRef("alpha")
	ref.UID = ""
	if _, err := editor.Events(context.Background(), ref); err == nil {
		t.Error("expected an error when the ref carries no uid")
	}
}

func eventObject(reason string, kind string, at string) *unstructured.Unstructured {
	return object("v1", "Event", reason, map[string]any{
		"type":          kind,
		"reason":        reason,
		"message":       reason + " happened",
		"lastTimestamp": at,
		"source":        map[string]any{"component": "kubelet"},
		"involvedObject": map[string]any{
			"kind": "Pod",
			"name": "alpha",
			"uid":  "uid-alpha",
		},
	})
}
