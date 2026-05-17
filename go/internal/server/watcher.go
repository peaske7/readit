package server

import (
	"os"
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
			// Atomic-rename saves (Vim/Neovim/Emacs) invalidate the
			// underlying fsnotify handle. Re-add the path so subsequent
			// edits keep firing events.
			if event.Has(fsnotify.Rename) || event.Has(fsnotify.Remove) {
				go w.rewatch(event.Name)
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

func (w *Watcher) rewatch(path string) {
	const maxRetries = 10
	const retryInterval = 200 * time.Millisecond
	for i := 0; i < maxRetries; i++ {
		time.Sleep(retryInterval)
		if _, err := os.Stat(path); err != nil {
			continue
		}
		_ = w.fsWatcher.Remove(path)
		if err := w.fsWatcher.Add(path); err != nil {
			continue
		}
		w.debounceChange(path)
		return
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
