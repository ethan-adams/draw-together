// Package hub tracks which clients are on which board and relays messages
// between them. It is deliberately content-agnostic: it moves opaque byte
// payloads and never parses the drawing protocol. That keeps the fan-out path
// cheap and makes the coming Redis swap a drop-in — publishing bytes to a
// channel is the same shape as handing bytes to local clients.
package hub

import "sync"

// Hub is the in-memory board registry for a single node.
type Hub struct {
	mu     sync.RWMutex
	boards map[string]map[*Client]struct{}
}

// New returns an empty Hub.
func New() *Hub {
	return &Hub{boards: make(map[string]map[*Client]struct{})}
}

func (h *Hub) add(c *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()
	m := h.boards[c.boardID]
	if m == nil {
		m = make(map[*Client]struct{})
		h.boards[c.boardID] = m
	}
	m[c] = struct{}{}
}

func (h *Hub) remove(c *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if m := h.boards[c.boardID]; m != nil {
		delete(m, c)
		if len(m) == 0 {
			delete(h.boards, c.boardID)
		}
	}
}

// Broadcast delivers payload to every client on boardID except the sender.
//
// Delivery is best-effort: if a client's send buffer is full it is skipped, not
// blocked on. LiveBoard favors fresh state over guaranteed delivery — a dropped
// intermediate stroke is corrected by the next one, and a snapshot covers a
// client that fell far behind. See DECISIONS.md.
func (h *Hub) Broadcast(boardID, senderID string, payload []byte) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	for c := range h.boards[boardID] {
		if c.id == senderID {
			continue
		}
		select {
		case c.send <- payload:
		default:
			// Slow consumer: drop this frame rather than stall the board.
		}
	}
}

// CountBoard returns how many clients this node holds for boardID.
func (h *Hub) CountBoard(boardID string) int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.boards[boardID])
}
