//go:build ignore

// Catch-up check: draw on one node, disconnect, then join *fresh on the other
// node* and confirm the drawing replays from shared Postgres state: board
// history survives across nodes and reconnects.
//
// Run it against `docker compose up`:
//
//	go run loadtest/catchup_check.go
package main

import (
	"encoding/json"
	"fmt"
	"os"
	"time"

	"github.com/gorilla/websocket"
)

const marker = "#abcdef" // distinctive color so we recognize our own stroke

func dial(url string) *websocket.Conn {
	c, _, err := websocket.DefaultDialer.Dial(url, nil)
	if err != nil {
		fmt.Printf("dial %s: %v\n", url, err)
		os.Exit(1)
	}
	return c
}

func send(c *websocket.Conn, v any) {
	b, _ := json.Marshal(v)
	if err := c.WriteMessage(websocket.TextMessage, b); err != nil {
		fmt.Println("write:", err)
		os.Exit(1)
	}
}

func main() {
	const board = "catchup"

	// Node gw1: wipe the board, then draw one distinctive stroke.
	a := dial("ws://localhost:8081/ws?board=" + board)
	send(a, map[string]any{"type": "clear"})
	send(a, map[string]any{
		"type":  "draw",
		"from":  map[string]int{"x": 5, "y": 5},
		"to":    map[string]int{"x": 6, "y": 6},
		"color": marker, "width": 2,
	})

	// Let the async writer flush to Postgres, then leave.
	time.Sleep(700 * time.Millisecond)
	a.Close()

	// Fresh client on gw2: it drew nothing, so anything it sees is catch-up.
	b := dial("ws://localhost:8082/ws?board=" + board)
	defer b.Close()

	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		_ = b.SetReadDeadline(deadline)
		_, msg, err := b.ReadMessage()
		if err != nil {
			break
		}
		var m map[string]any
		if json.Unmarshal(msg, &m) == nil && m["type"] == "draw" && m["color"] == marker {
			fmt.Println("PASS: a stroke drawn on gw1 replayed to a fresh client on gw2")
			return
		}
	}
	fmt.Println("FAIL: the drawing did not replay on the other node")
	os.Exit(1)
}
