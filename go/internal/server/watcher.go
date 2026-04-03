package server

import (
	"sync"
	"time"

	"github.com/fsnotify/fsnotify"
)

type Watcher struct {
	fsWatcher *fsnotify.Watcher
	debounce  map[string]*time.Timer
	onChange  func(filePath string)
	mu        sync.Mutex
	done      chan struct{}
}

func NewWatcher(onChange func(string)) (*Watcher, error) {
	fsw, err := fsnotify.NewWatcher()
	if err != nil {
		return nil, err
	}

	w := &Watcher{
		fsWatcher: fsw,
		debounce:  make(map[string]*time.Timer),
		onChange:  onChange,
		done:      make(chan struct{}),
	}

	go w.loop()
	return w, nil
}

func (w *Watcher) loop() {
	for {
		select {
		case event, ok := <-w.fsWatcher.Events:
			if !ok {
				return
			}
			if event.Has(fsnotify.Write) || event.Has(fsnotify.Create) {
				w.debounceChange(event.Name)
			}
		case _, ok := <-w.fsWatcher.Errors:
			if !ok {
				return
			}
		case <-w.done:
			return
		}
	}
}

func (w *Watcher) debounceChange(path string) {
	w.mu.Lock()
	defer w.mu.Unlock()

	if t, ok := w.debounce[path]; ok {
		t.Stop()
	}
	w.debounce[path] = time.AfterFunc(100*time.Millisecond, func() {
		w.onChange(path)
	})
}

func (w *Watcher) Add(path string) error {
	return w.fsWatcher.Add(path)
}

func (w *Watcher) Close() {
	close(w.done)
	_ = w.fsWatcher.Close()
}
