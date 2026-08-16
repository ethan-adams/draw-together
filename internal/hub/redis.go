package hub

import (
	"context"
	"log"
	"strings"
	"sync"

	"github.com/redis/go-redis/v9"
)

const channelPrefix = "board:"

// RedisBroadcaster fans messages out across nodes using Redis pub/sub.
//
// On Publish it does two things:
//  1. delivers to this node's own clients immediately (low latency), and
//  2. publishes the frame to the board's Redis channel for the other nodes.
//
// Every frame is tagged with this node's id. The receive loop skips frames this
// node published itself, so a client never sees a duplicate. A node subscribes
// to a board's channel only while it actually hosts clients on that board
// (ref-counted via BindBoard / UnbindBoard), so no node carries traffic for
// boards it isn't serving — that's what keeps horizontal scaling honest.
type RedisBroadcaster struct {
	nodeID string
	rdb    *redis.Client
	pubsub *redis.PubSub
	hub    *Hub
	ctx    context.Context

	mu   sync.Mutex
	refs map[string]int
}

// NewRedisBroadcaster connects to Redis and starts the receive loop. It returns
// an error if Redis is unreachable, so startup fails loudly rather than silently
// degrading to a single node.
func NewRedisBroadcaster(ctx context.Context, addr string, h *Hub) (*RedisBroadcaster, error) {
	rdb := redis.NewClient(&redis.Options{Addr: addr})
	if err := rdb.Ping(ctx).Err(); err != nil {
		return nil, err
	}
	b := &RedisBroadcaster{
		nodeID: newID(),
		rdb:    rdb,
		pubsub: rdb.Subscribe(ctx), // start with no channels; bind adds them
		hub:    h,
		ctx:    ctx,
		refs:   make(map[string]int),
	}
	go b.receiveLoop()
	return b, nil
}

func channelFor(boardID string) string { return channelPrefix + boardID }
func boardFrom(channel string) string  { return strings.TrimPrefix(channel, channelPrefix) }

// encode frames a payload as nodeID (fixed 16 hex chars) + payload.
func (b *RedisBroadcaster) encode(payload []byte) []byte {
	out := make([]byte, 0, len(b.nodeID)+len(payload))
	out = append(out, b.nodeID...)
	out = append(out, payload...)
	return out
}

// Publish delivers locally, then broadcasts to the other nodes.
func (b *RedisBroadcaster) Publish(boardID, senderID string, payload []byte) {
	b.hub.DeliverLocal(boardID, senderID, payload)
	if err := b.rdb.Publish(b.ctx, channelFor(boardID), b.encode(payload)).Err(); err != nil {
		log.Printf("redis publish %s: %v", boardID, err)
	}
}

// BindBoard subscribes to a board's channel on the first local client.
func (b *RedisBroadcaster) BindBoard(boardID string) {
	b.mu.Lock()
	n := b.refs[boardID]
	b.refs[boardID] = n + 1
	b.mu.Unlock()
	if n == 0 {
		if err := b.pubsub.Subscribe(b.ctx, channelFor(boardID)); err != nil {
			log.Printf("redis subscribe %s: %v", boardID, err)
		}
	}
}

// UnbindBoard unsubscribes when the last local client leaves.
func (b *RedisBroadcaster) UnbindBoard(boardID string) {
	b.mu.Lock()
	n := b.refs[boardID] - 1
	if n <= 0 {
		delete(b.refs, boardID)
	} else {
		b.refs[boardID] = n
	}
	b.mu.Unlock()
	if n <= 0 {
		if err := b.pubsub.Unsubscribe(b.ctx, channelFor(boardID)); err != nil {
			log.Printf("redis unsubscribe %s: %v", boardID, err)
		}
	}
}

func (b *RedisBroadcaster) receiveLoop() {
	idLen := len(b.nodeID)
	for msg := range b.pubsub.Channel() {
		data := []byte(msg.Payload)
		if len(data) < idLen {
			continue
		}
		if string(data[:idLen]) == b.nodeID {
			continue // our own publish — local clients already have it
		}
		b.hub.DeliverLocal(boardFrom(msg.Channel), "", data[idLen:])
	}
}
