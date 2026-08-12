package app

import (
	"context"

	"nens-k8s/internal/domain"
)

type ResourceAPI struct {
	store  domain.ResourceSubscriber
	editor domain.ResourceEditor
	ctx    context.Context
}

func NewResourceAPI(store domain.ResourceSubscriber, editor domain.ResourceEditor) *ResourceAPI {
	return &ResourceAPI{store: store, editor: editor}
}

func (a *ResourceAPI) bind(ctx context.Context) {
	a.ctx = ctx
}

func (a *ResourceAPI) Subscribe(token string, clusterID string, gvr domain.GVR, namespace string) (domain.Subscription, error) {
	return a.store.Subscribe(token, clusterID, gvr, namespace)
}

func (a *ResourceAPI) Unsubscribe(token string) error {
	return a.store.Unsubscribe(token)
}

func (a *ResourceAPI) Get(ref domain.ResourceRef) (map[string]any, error) {
	return a.editor.Get(a.ctx, ref)
}

func (a *ResourceAPI) Apply(ref domain.ResourceRef, object map[string]any) (map[string]any, error) {
	return a.editor.Apply(a.ctx, ref, object)
}

func (a *ResourceAPI) Delete(ref domain.ResourceRef) error {
	return a.editor.Delete(a.ctx, ref)
}

func (a *ResourceAPI) Scale(ref domain.ResourceRef, replicas int32) error {
	return a.editor.Scale(a.ctx, ref, replicas)
}

func (a *ResourceAPI) Owners(ref domain.ResourceRef) ([]domain.OwnerRef, error) {
	return a.editor.Owners(a.ctx, ref)
}

func (a *ResourceAPI) Events(ref domain.ResourceRef) ([]domain.EventRecord, error) {
	return a.editor.Events(a.ctx, ref)
}
