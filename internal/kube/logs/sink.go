package logs

import (
	"strings"
	"sync"
	"time"

	"nens-k8s/internal/domain"
	"nens-k8s/internal/event"
)

const (
	flushInterval = 100 * time.Millisecond
	maxPending    = 5000
	maxLineBytes  = 8 << 10
)

// sink coalesces the reader's lines into one chunk per flushInterval, and drops
// the oldest lines once a chatty pod outruns that window.
type sink struct {
	bus   domain.Publisher
	token string

	mu      sync.Mutex
	pending []string
	dropped int
	timer   *time.Timer
	closed  bool
}

func newSink(bus domain.Publisher, token string) *sink {
	return &sink{bus: bus, token: token}
}

func (s *sink) push(line string) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.closed {
		return
	}

	s.pending = append(s.pending, clean(line))
	if overflow := len(s.pending) - maxPending; overflow > 0 {
		s.pending = append(s.pending[:0], s.pending[overflow:]...)
		s.dropped += overflow
	}
	if s.timer == nil {
		s.timer = time.AfterFunc(flushInterval, s.flush)
	}
}

func (s *sink) flush() {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.timer = nil
	if len(s.pending) == 0 && s.dropped == 0 {
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
	if s.timer != nil {
		s.timer.Stop()
		s.timer = nil
	}

	failure := ""
	if err != nil {
		failure = err.Error()
	}
	s.emitLocked(true, failure)
}

func (s *sink) emitLocked(done bool, failure string) {
	chunk := domain.LogChunk{
		Token:   s.token,
		Lines:   s.pending,
		Dropped: s.dropped,
		Done:    done,
		Error:   failure,
	}
	s.pending = nil
	s.dropped = 0

	s.bus.Publish(event.TopicLogChunk, chunk)
}

func clean(line string) string {
	line = strings.TrimRight(line, "\r\n")
	if len(line) > maxLineBytes {
		return strings.ToValidUTF8(line[:maxLineBytes], "") + "…"
	}
	return line
}
