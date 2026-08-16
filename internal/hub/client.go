package hub

import (
	"crypto/rand"
	"encoding/hex"
	"net/http"
	"time"

	"github.com/gorilla/websocket"
)

const (
	writeWait      = 10 * time.Second
	pongWait       = 60 * time.Second
	pingPeriod     = (pongWait * 9) / 10
	maxMessageSize = 1 << 20 // 1 MiB
	sendBuffer     = 256
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  4096,
	WriteBufferSize: 4096,
	// Dev default: accept any origin. Tighten via an allowlist before exposing
	// the gateway beyond localhost / the cluster.
	CheckOrigin: func(r *http.Request) bool { return true },
}

// Client is one WebSocket connection bound to a single board.
type Client struct {
	id      string
	boardID string
	hub     *Hub
	conn    *websocket.Conn
	send    chan []byte
}

// ServeWS upgrades an HTTP request to a WebSocket and registers the client on
// the board named by the ?board= query parameter (default "default").
func (h *Hub) ServeWS(w http.ResponseWriter, r *http.Request) {
	boardID := r.URL.Query().Get("board")
	if boardID == "" {
		boardID = "default"
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return // Upgrade already wrote an error response.
	}

	c := &Client{
		id:      newID(),
		boardID: boardID,
		hub:     h,
		conn:    conn,
		send:    make(chan []byte, sendBuffer),
	}
	h.add(c)

	// Tell the client the id the server assigned it, so it can stamp its own
	// ops and ignore its own echoes.
	c.send <- []byte(`{"type":"hello","clientId":"` + c.id + `"}`)

	go c.writePump()
	go c.readPump()
}

// readPump relays inbound frames to the rest of the board until the socket
// closes, then removes the client.
func (c *Client) readPump() {
	defer func() {
		c.hub.remove(c)
		_ = c.conn.Close()
	}()

	c.conn.SetReadLimit(maxMessageSize)
	_ = c.conn.SetReadDeadline(time.Now().Add(pongWait))
	c.conn.SetPongHandler(func(string) error {
		return c.conn.SetReadDeadline(time.Now().Add(pongWait))
	})

	for {
		_, msg, err := c.conn.ReadMessage()
		if err != nil {
			return
		}
		c.hub.Broadcast(c.boardID, c.id, msg)
	}
}

// writePump drains the send channel to the socket and keeps the connection
// alive with periodic pings.
func (c *Client) writePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		_ = c.conn.Close()
	}()

	for {
		select {
		case msg, ok := <-c.send:
			_ = c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				_ = c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			if err := c.conn.WriteMessage(websocket.TextMessage, msg); err != nil {
				return
			}
		case <-ticker.C:
			_ = c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

func newID() string {
	var b [8]byte
	_, _ = rand.Read(b[:])
	return hex.EncodeToString(b[:])
}
