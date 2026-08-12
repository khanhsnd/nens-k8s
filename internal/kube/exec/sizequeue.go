package exec

import (
	"sync"

	"k8s.io/client-go/tools/remotecommand"
)

// sizeQueue is latest-wins: a resize nobody has read yet is worthless once the
// window has moved again. Closing it is what lets remotecommand's resize
// goroutine exit when the stream ends.
type sizeQueue struct {
	mu     sync.Mutex
	sizes  chan remotecommand.TerminalSize
	closed bool
}

func newSizeQueue(cols uint16, rows uint16) *sizeQueue {
	queue := &sizeQueue{sizes: make(chan remotecommand.TerminalSize, 1)}
	if cols > 0 && rows > 0 {
		queue.push(cols, rows)
	}
	return queue
}

func (q *sizeQueue) Next() *remotecommand.TerminalSize {
	size, ok := <-q.sizes
	if !ok {
		return nil
	}
	return &size
}

func (q *sizeQueue) push(cols uint16, rows uint16) {
	q.mu.Lock()
	defer q.mu.Unlock()

	if q.closed {
		return
	}

	select {
	case <-q.sizes:
	default:
	}
	q.sizes <- remotecommand.TerminalSize{Width: cols, Height: rows}
}

func (q *sizeQueue) close() {
	q.mu.Lock()
	defer q.mu.Unlock()

	if q.closed {
		return
	}
	q.closed = true
	close(q.sizes)
}
