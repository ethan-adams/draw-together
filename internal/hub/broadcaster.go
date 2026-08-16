package hub

// LocalBroadcaster is the single-node fan-out strategy: a published message is
// delivered straight to this node's own clients. There are no other nodes to
// coordinate with, so BindBoard / UnbindBoard are no-ops.
type LocalBroadcaster struct {
	hub *Hub
}

// NewLocalBroadcaster returns a broadcaster that delivers within one process.
func NewLocalBroadcaster(h *Hub) *LocalBroadcaster { return &LocalBroadcaster{hub: h} }

func (l *LocalBroadcaster) Publish(boardID, senderID string, payload []byte) {
	l.hub.DeliverLocal(boardID, senderID, payload)
}

func (l *LocalBroadcaster) BindBoard(string)   {}
func (l *LocalBroadcaster) UnbindBoard(string) {}
