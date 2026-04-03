package server

import (
	"fmt"
	"net/http"
	"sync"
	"time"
)

// SSEBroker manages Server-Sent Event connections for document updates and heartbeat.
type SSEBroker struct {
	docClients       map[chan string]struct{}
	heartbeatClients map[chan string]struct{}
	mu               sync.Mutex
	shutdownTimer    *time.Timer
	shutdownEpoch    int
	isDev            bool
	onShutdown       func()
}

func NewSSEBroker(isDev bool, onShutdown func()) *SSEBroker {
	return &SSEBroker{
		docClients:       make(map[chan string]struct{}),
		heartbeatClients: make(map[chan string]struct{}),
		isDev:            isDev,
		onShutdown:       onShutdown,
	}
}

func (b *SSEBroker) Broadcast(event string) {
	b.mu.Lock()
	defer b.mu.Unlock()
	for ch := range b.docClients {
		select {
		case ch <- event:
		default:
		}
	}
}

func (b *SSEBroker) DocumentStream(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming not supported", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")

	ch := make(chan string, 16)
	b.mu.Lock()
	b.docClients[ch] = struct{}{}
	b.mu.Unlock()

	defer func() {
		b.mu.Lock()
		delete(b.docClients, ch)
		b.mu.Unlock()
	}()

	_, _ = fmt.Fprint(w, "data: connected\n\n")
	flusher.Flush()

	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-r.Context().Done():
			return
		case msg := <-ch:
			_, _ = fmt.Fprintf(w, "data: %s\n\n", msg)
			flusher.Flush()
		case <-ticker.C:
			_, _ = fmt.Fprint(w, "data: ping\n\n")
			flusher.Flush()
		}
	}
}

func (b *SSEBroker) Heartbeat(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming not supported", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")

	ch := make(chan string, 4)
	b.mu.Lock()
	b.heartbeatClients[ch] = struct{}{}
	if b.shutdownTimer != nil {
		b.shutdownTimer.Stop()
		b.shutdownTimer = nil
	}
	b.shutdownEpoch++
	b.mu.Unlock()

	defer func() {
		b.mu.Lock()
		delete(b.heartbeatClients, ch)
		if len(b.heartbeatClients) == 0 && !b.isDev && b.onShutdown != nil {
			if b.shutdownTimer != nil {
				b.shutdownTimer.Stop()
			}
			b.shutdownEpoch++
			epoch := b.shutdownEpoch
			b.shutdownTimer = time.AfterFunc(1500*time.Millisecond, func() {
				b.mu.Lock()
				defer b.mu.Unlock()
				if b.shutdownEpoch == epoch {
					b.onShutdown()
				}
			})
		}
		b.mu.Unlock()
	}()

	_, _ = fmt.Fprint(w, "data: connected\n\n")
	flusher.Flush()

	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-r.Context().Done():
			return
		case <-ticker.C:
			_, _ = fmt.Fprint(w, "data: ping\n\n")
			flusher.Flush()
		}
	}
}
