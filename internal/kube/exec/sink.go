package exec

import (
	"encoding/base64"
	"sync"
	"time"

	"nens-k8s/internal/domain"
	"nens-k8s/internal/event"
)

const (
	flushInterval = 16 * time.Millisecond
	maxPending    = 64 << 10
)

// sink batches terminal output into one event per frame, and flushes early when
// a command dumps more than a frame's worth at once.
type sink struct {
	bus   domain.Publisher
	token string

	mu      sync.Mutex
	pending []byte
	timer   *time.Timer
	closed  bool
}

func newSink(bus domain.Publisher, token string) *sink {
	return &sink{bus: bus, token: token}
}

func (s *sink) Write(data []byte) (int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.closed {
		return len(data), nil
	}

	s.pending = append(s.pending, data...)
	if len(s.pending) >= maxPending {
		s.stopTimerLocked()
		s.emitLocked(false, "")
		return len(data), nil
	}
	if s.timer == nil {
		s.timer = time.AfterFunc(flushInterval, s.flush)
	}
	return len(data), nil
}

func (s *sink) flush() {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.timer = nil
	if len(s.pending) == 0 {
		return
	}
	s.emitLocked(false, "")
}

func (s *sink) close(err error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.closed {
		return
	}
	s.closed = true
	s.stopTimerLocked()

	failure := ""
	if err != nil {
		failure = err.Error()
	}
	s.emitLocked(true, failure)
}

func (s *sink) stopTimerLocked() {
	if s.timer != nil {
		s.timer.Stop()
		s.timer = nil
	}
}

func (s *sink) emitLocked(done bool, failure string) {
	chunk := domain.ExecChunk{
		Token: s.token,
		Data:  base64.StdEncoding.EncodeToString(s.pending),
		Done:  done,
		Error: failure,
	}
	s.pending = nil

	s.bus.Publish(event.TopicExecData, chunk)
}
