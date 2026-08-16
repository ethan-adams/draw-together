// Command gateway is a stateless WebSocket node for LiveBoard.
//
// Every node is interchangeable: a client can connect to any node and still
// share a board with clients on other nodes. In this single-node MVP the hub
// keeps board membership in memory; a later step swaps the in-process fan-out
// for Redis pub/sub so N nodes serve one logical board.
package main

import (
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
