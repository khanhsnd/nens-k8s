package app

import "nens-k8s/internal/domain"

type ResourceAPI struct {
	store domain.ResourceSubscriber
}

func NewResourceAPI(store domain.ResourceSubscriber) *ResourceAPI {
	return &ResourceAPI{store: store}
}

func (a *ResourceAPI) Subscribe(token string, clusterID string, gvr domain.GVR, namespace string) (domain.Subscription, error) {
	return a.store.Subscribe(token, clusterID, gvr, namespace)
}

func (a *ResourceAPI) Unsubscribe(token string) error {
	return a.store.Unsubscribe(token)
}
