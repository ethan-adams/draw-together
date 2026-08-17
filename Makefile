# Draw: the Makefile is the front door.
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

.PHONY: ui
ui: ## Install deps and build the React UI to web/dist
	cd web && npm install && npm run build

.PHONY: dev
dev: ui ## Build the UI, then run the gateway at http://localhost:8080
	go run $(GATEWAY)

.PHONY: ui-dev
ui-dev: ## Vite dev server with hot reload (run `go run ./cmd/gateway` alongside)
	cd web && npm run dev

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

# ---- Load test (docker-compose) -------------------------------------------
CONNS ?= 500
ROOM  ?= 20
HOLD  ?= 25s

.PHONY: loadtest
loadtest: ## k6 WebSocket load test against docker-compose (CONNS=500 ROOM=20)
	CONNS=$(CONNS) ROOM=$(ROOM) HOLD=$(HOLD) k6 run loadtest/ws_load.js

# ---- Kubernetes on kind ---------------------------------------------------
KIND_CLUSTER ?= draw
IMAGE        ?= draw/gateway:local

.PHONY: image
image: ## Build the gateway container image
	docker build -t $(IMAGE) .

.PHONY: kind-up
kind-up: ## Create the kind cluster, load the image, deploy Redis/Postgres/gateway
	kind create cluster --config deploy/kind/cluster.yaml
	$(MAKE) image
	kind load docker-image $(IMAGE) --name $(KIND_CLUSTER)
	kubectl apply -f deploy/k8s/redis.yaml -f deploy/k8s/postgres.yaml
	kubectl rollout status deploy/redis --timeout=120s
	kubectl rollout status deploy/postgres --timeout=120s
	kubectl apply -f deploy/k8s/gateway.yaml
	kubectl rollout status deploy/draw-gateway --timeout=120s
	@echo "cluster ready. Browse with 'make k8s-forward', load-test with 'make k8s-loadtest'"

.PHONY: kind-down
kind-down: ## Delete the kind cluster
	kind delete cluster --name $(KIND_CLUSTER)

.PHONY: k8s-forward
k8s-forward: ## Port-forward the gateway to http://localhost:8080 for the browser
	kubectl port-forward svc/draw-gateway 8080:8080

.PHONY: metrics-server
metrics-server: ## Install metrics-server (kind-friendly) and apply the HPA
	kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml
	kubectl patch deploy metrics-server -n kube-system --type=json \
	  -p='[{"op":"add","path":"/spec/template/spec/containers/0/args/-","value":"--kubelet-insecure-tls"}]'
	kubectl -n kube-system rollout status deploy/metrics-server --timeout=120s
	kubectl apply -f deploy/k8s/hpa.yaml

.PHONY: k8s-loadtest
k8s-loadtest: ## In-cluster load test (override CONNS/ROOM/HOLD; e.g. CONNS=3000)
	kubectl create configmap ws-load --from-file=loadtest/ws_load.js --dry-run=client -o yaml | kubectl apply -f -
	kubectl delete job k6-load --ignore-not-found
	sed -e 's/__CONNS__/$(CONNS)/' -e 's/__ROOM__/$(ROOM)/' -e 's/__HOLD__/$(HOLD)/' loadtest/k6-job.yaml | kubectl apply -f -
	kubectl wait --for=condition=complete job/k6-load --timeout=360s || true
	kubectl logs job/k6-load
