package app

import (
	"context"

	"nens-k8s/internal/domain"
)

type MetricsAPI struct {
	metrics domain.MetricsSampler
	ctx     context.Context
}

func NewMetricsAPI(metrics domain.MetricsSampler) *MetricsAPI {
	return &MetricsAPI{metrics: metrics}
}

func (a *MetricsAPI) bind(ctx context.Context) {
	a.ctx = ctx
}

func (a *MetricsAPI) Sample(clusterID string) (domain.MetricsSample, error) {
	return a.metrics.Sample(a.ctx, clusterID)
}
