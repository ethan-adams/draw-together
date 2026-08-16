package hub

import "testing"

// newTestClient builds a client with just the fields DeliverLocal touches, so
// the hub can be exercised without a real WebSocket connection.
func newTestClient(id, board string) *Client {
	return &Client{id: id, boardID: board, send: make(chan []byte, 4)}
}

func TestDeliverLocalSkipsSender(t *testing.T) {
	h := New()
	a := newTestClient("a", "room")
	b := newTestClient("b", "room")
	h.add(a)
	h.add(b)

	h.DeliverLocal("room", "a", []byte("hi"))

	select {
	case <-a.send:
		t.Fatal("sender should not receive its own message")
	default:
	}
	select {
	case msg := <-b.send:
		if string(msg) != "hi" {
			t.Fatalf("peer got %q, want %q", msg, "hi")
		}
	default:
		t.Fatal("peer should have received the message")
	}
}

func TestPublishGoesThroughLocalBroadcaster(t *testing.T) {
	h := New() // defaults to LocalBroadcaster
	a := newTestClient("a", "room")
	b := newTestClient("b", "room")
	h.add(a)
	h.add(b)

	h.Publish("room", "a", []byte("stroke"))

	select {
	case msg := <-b.send:
		if string(msg) != "stroke" {
			t.Fatalf("peer got %q, want %q", msg, "stroke")
		}
	default:
		t.Fatal("Publish should have reached the peer via the local broadcaster")
	}
}

func TestBoardCleanupOnLastLeave(t *testing.T) {
	h := New()
	a := newTestClient("a", "room")
	h.add(a)
	if got := h.CountBoard("room"); got != 1 {
		t.Fatalf("CountBoard = %d, want 1", got)
	}
	h.remove(a)
	if got := h.CountBoard("room"); got != 0 {
		t.Fatalf("CountBoard after leave = %d, want 0", got)
	}
}

func TestRedisFrameRoundTrip(t *testing.T) {
	b := &RedisBroadcaster{nodeID: "0123456789abcdef"}
	payload := []byte(`{"type":"draw"}`)
	frame := b.encode(payload)

	if got := string(frame[:len(b.nodeID)]); got != b.nodeID {
		t.Fatalf("frame prefix = %q, want node id %q", got, b.nodeID)
	}
	if got := string(frame[len(b.nodeID):]); got != string(payload) {
		t.Fatalf("frame payload = %q, want %q", got, payload)
	}
}
