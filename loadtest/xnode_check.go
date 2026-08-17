//go:build ignore

// Cross-node check: connect two clients to two *different* gateway nodes on the
// same board, send from one, and confirm the other receives it: Redis
// fan-out really crosses nodes.
//
// Run it against `docker compose up`:
//
//	go run loadtest/xnode_check.go
package main

import (
	"encoding/json"
	"fmt"
	"os"
	"time"

	"github.com/gorilla/websocket"
)

func dial(url string) *websocket.Conn {
	c, _, err := websocket.DefaultDialer.Dial(url, nil)
	if err != nil {
		fmt.Printf("dial %s: %v\n", url, err)
		os.Exit(1)
	}
	return c
}

func main() {
	const board = "proof"
	a := dial("ws://localhost:8081/ws?board=" + board) // node gw1
	defer a.Close()
	b := dial("ws://localhost:8082/ws?board=" + board) // node gw2
	defer b.Close()

	// Let gw2's subscription for this board register.
	time.Sleep(300 * time.Millisecond)

	got := make(chan bool, 1)
	go func() {
		for {
			_, msg, err := b.ReadMessage()
			if err != nil {
				return
			}
			var m map[string]any
			if json.Unmarshal(msg, &m) == nil && m["type"] == "draw" {
				got <- true
				return
			}
		}
	}()

	draw, _ := json.Marshal(map[string]any{
		"type":  "draw",
		"from":  map[string]int{"x": 0, "y": 0},
		"to":    map[string]int{"x": 10, "y": 10},
		"color": "#000", "width": 3,
	})
	if err := a.WriteMessage(websocket.TextMessage, draw); err != nil {
		fmt.Println("write:", err)
		os.Exit(1)
	}

	select {
	case <-got:
		fmt.Println("PASS: a stroke on node gw1 reached a client on node gw2")
	case <-time.After(3 * time.Second):
		fmt.Println("FAIL: the stroke never crossed nodes")
		os.Exit(1)
	}
}
