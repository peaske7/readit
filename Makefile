.PHONY: dev build build-client build-server test test-client test-e2e clean

# Development: Go server manages Vite child process
dev:
	cd go && go run ./cmd/readit -- --dev $(ARGS)

# Production build: frontend first, then Go embeds it
build: build-client build-server

build-client:
	bunx vite build

build-server: build-client
	cp -r dist/ go/internal/server/dist/
	cd go && go build -o ../dist/readit ./cmd/readit

# Tests
test:
	cd go && go test ./...

test-client:
	bun run test

test-e2e:
	bun run test:e2e

clean:
	rm -rf dist go/internal/server/dist
	mkdir -p go/internal/server/dist
	touch go/internal/server/dist/.gitkeep
