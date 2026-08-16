# LiveBoard — the Makefile is the front door.
# Right now: single-node dev. Kubernetes / kind / k6 targets land in later steps.

.DEFAULT_GOAL := help
GATEWAY := ./cmd/gateway

.PHONY: help
help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

.PHONY: tidy
tidy: ## Resolve Go dependencies
	go mod tidy

.PHONY: dev
dev: ## Run the gateway locally, then open http://localhost:8080 in two tabs
	go run $(GATEWAY)

.PHONY: build
build: ## Compile the gateway binary to ./bin/gateway
	go build -o bin/gateway $(GATEWAY)

.PHONY: test
test: ## Run tests
	go test ./...

.PHONY: fmt
fmt: ## Format Go code
	go fmt ./...

.PHONY: vet
vet: ## Static checks
	go vet ./...
