package event

import (
	"context"
	"sync"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

const (
	TopicClusterChanged = "cluster:changed"
	TopicResourceEvent  = "resource:event"
)

type Bus struct {
	mu  sync.RWMutex
	ctx context.Context
}

func NewBus() *Bus {
	return &Bus{}
}

func (b *Bus) Bind(ctx context.Context) {
	b.mu.Lock()
	b.ctx = ctx
	b.mu.Unlock()
}

func (b *Bus) Publish(topic string, payload any) {
	b.mu.RLock()
	ctx := b.ctx
	b.mu.RUnlock()

	if ctx == nil {
		return
	}
	runtime.EventsEmit(ctx, topic, payload)
}
