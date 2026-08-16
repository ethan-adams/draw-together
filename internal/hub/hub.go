// Package hub tracks which clients are on which board on this node and delivers
// messages to them. Moving a message *between* nodes is delegated to a
// Broadcaster, so the same code runs as a single node or as one of many.
package hub

import "sync"

// Broadcaster moves a board's messages beyond this process.
//
//   - Publish is called for every inbound client message.
//   - BindBoard / UnbindBoard tell the broadcaster when this node starts and
//     stops hosting clients on a board, so it can manage cross-node subscriptions.
//
// The single-node LocalBroadcaster treats Publish as a direct local delivery
// and the bind calls as no-ops.
type Broadcaster interface {
	Publish(boardID, senderID string, payload []byte)
	BindBoard(boardID string)
	UnbindBoard(boardID string)
}

// Hub is the per-node board registry.
type Hub struct {
	// NodeName is a human label for this process (e.g. "gw1"), sent to clients
	// in the hello message so a demo can show which node served them.
	NodeName string

	mu     sync.RWMutex
	boards map[string]map[*Client]struct{}
	b      Broadcaster
}

// New returns a Hub that defaults to single-node (local) fan-out.
func New() *Hub {
	h := &Hub{boards: make(map[string]map[*Client]struct{})}
	h.b = NewLocalBroadcaster(h)
	return h
}

// SetBroadcaster swaps the fan-out strategy. Call once at startup, before serving.
func (h *Hub) SetBroadcaster(b Broadcaster) { h.b = b }

func (h *Hub) add(c *Client) {
	h.mu.Lock()
	m := h.boards[c.boardID]
	first := m == nil
	if first {
		m = make(map[*Client]struct{})
		h.boards[c.boardID] = m
	}
	m[c] = struct{}{}
	h.mu.Unlock()

	if first {
		// First client for this board on this node: start listening for it.
		h.b.BindBoard(c.boardID)
	}
}

func (h *Hub) remove(c *Client) {
	h.mu.Lock()
	last := false
	if m := h.boards[c.boardID]; m != nil {
		delete(m, c)
		if len(m) == 0 {
			delete(h.boards, c.boardID)
			last = true
		}
	}
	h.mu.Unlock()

	if last {
		// Last client left: stop carrying traffic for this board.
		h.b.UnbindBoard(c.boardID)
	}
}

// Publish hands an inbound client message to the fan-out layer.
func (h *Hub) Publish(boardID, senderID string, payload []byte) {
	h.b.Publish(boardID, senderID, payload)
}

// DeliverLocal sends payload to every client this node holds for boardID,
// skipping senderID. The Broadcaster calls this for both local-origin and
// remote-origin messages.
//
// Delivery is best-effort: a client whose send buffer is full is skipped rather
// than blocked on. LiveBoard favors fresh state over guaranteed delivery — see
// DECISIONS.md.
func (h *Hub) DeliverLocal(boardID, senderID string, payload []byte) {
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
