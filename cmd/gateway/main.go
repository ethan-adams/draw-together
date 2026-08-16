// Command gateway is a stateless WebSocket node for LiveBoard.
//
// Every node is interchangeable: a client can connect to any node and still
// share a board with clients on other nodes. Fan-out between nodes is handled by
// Redis pub/sub when REDIS_ADDR is set; otherwise the node runs standalone with
// in-process delivery.
package main

import (
	"context"
	"flag"
	"log"
	"net/http"
	"os"

	"github.com/ethan-adams/liveboard/internal/hub"
)

func main() {
	addr := flag.String("addr", envOr("ADDR", ":8080"), "listen address")
	webDir := flag.String("web", envOr("WEB_DIR", "web"), "static assets directory")
	flag.Parse()

	h := hub.New()
	h.NodeName = nodeName()

	if redisAddr := os.Getenv("REDIS_ADDR"); redisAddr != "" {
		rb, err := hub.NewRedisBroadcaster(context.Background(), redisAddr, h)
		if err != nil {
			log.Fatalf("redis fan-out unavailable at %s: %v", redisAddr, err)
		}
		h.SetBroadcaster(rb)
		log.Printf("fan-out: redis %s | node %s", redisAddr, h.NodeName)
	} else {
		log.Printf("fan-out: local single-node | node %s", h.NodeName)
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/ws", h.ServeWS)
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})
	mux.Handle("/", http.FileServer(http.Dir(*webDir)))

	log.Printf("liveboard gateway listening on %s (serving %q)", *addr, *webDir)
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
