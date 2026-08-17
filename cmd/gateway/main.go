// Command gateway is a stateless WebSocket node for Draw.
//
// Every node is interchangeable: a client can connect to any node and still
// share a board with clients on other nodes. Fan-out between nodes uses Redis
// pub/sub when REDIS_ADDR is set; board state is persisted to Postgres when
// POSTGRES_DSN is set, so a late joiner on any node sees the current drawing.
// With neither set, the node runs standalone with in-process delivery and
// in-memory catch-up.
package main

import (
	"context"
	"flag"
	"log"
	"net/http"
	"os"

	"github.com/ethan-adams/draw-together/internal/gql"
	"github.com/ethan-adams/draw-together/internal/hub"
	"github.com/ethan-adams/draw-together/internal/store"
)

func main() {
	addr := flag.String("addr", envOr("ADDR", ":8080"), "listen address")
	webDir := flag.String("web", envOr("WEB_DIR", "web/dist"), "static assets directory")
	flag.Parse()

	ctx := context.Background()

	h := hub.New()
	h.NodeName = nodeName()

	// Fan-out: Redis across nodes, or in-process for a single node.
	if redisAddr := os.Getenv("REDIS_ADDR"); redisAddr != "" {
		rb, err := hub.NewRedisBroadcaster(ctx, redisAddr, h)
		if err != nil {
			log.Fatalf("redis fan-out unavailable at %s: %v", redisAddr, err)
		}
		h.SetBroadcaster(rb)
		log.Printf("fan-out: redis %s | node %s", redisAddr, h.NodeName)
	} else {
		log.Printf("fan-out: local single-node | node %s", h.NodeName)
	}

	// Persistence: Postgres shared across nodes, or in-memory for a single node.
	// The recorder is also the board registry the GraphQL control plane reads.
	var registry store.BoardRegistry
	if dsn := os.Getenv("POSTGRES_DSN"); dsn != "" {
		pr, err := store.NewPostgres(ctx, dsn)
		if err != nil {
			log.Fatalf("postgres unavailable: %v", err)
		}
		h.SetRecorder(pr)
		registry = pr
		log.Printf("persistence: postgres (shared catch-up)")
	} else {
		mem := store.NewMemory()
		h.SetRecorder(mem)
		registry = mem
		log.Printf("persistence: in-memory (single-node catch-up)")
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/ws", h.ServeWS)
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})
	// Cold path: the GraphQL control plane (list/create boards) + a playground.
	mux.Handle("/graphql", gql.NewServer(registry))
	mux.Handle("/graphql/playground", gql.PlaygroundHandler())
	mux.Handle("/", http.FileServer(http.Dir(*webDir)))

	log.Printf("draw gateway listening on %s (serving %q)", *addr, *webDir)
	if err := http.ListenAndServe(*addr, mux); err != nil {
		log.Fatal(err)
	}
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// nodeName is a short human label for this process, used in the hello message.
func nodeName() string {
	if v := os.Getenv("NODE_NAME"); v != "" {
		return v
	}
	if hn, err := os.Hostname(); err == nil && hn != "" {
		if len(hn) > 12 {
			hn = hn[:12]
		}
		return hn
	}
	return "node"
}
