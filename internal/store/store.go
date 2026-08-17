// Package store persists a board's durable ops (added objects, erases, and
// clears) so a client joining late — on any node — can replay the current
// drawing. Cursor and hello messages are transient and are never stored.
//
// It offers two implementations of hub.Recorder:
//
//   - MemoryRecorder: single-process, no dependencies (used by `make dev`).
//   - PostgresRecorder: shared across nodes, so catch-up works cluster-wide.
package store

import (
	"encoding/json"
	"sync"
)

// opType reads just the "type" field of a message to classify it.
func opType(payload []byte) string {
	var m struct {
		Type string `json:"type"`
	}
	if json.Unmarshal(payload, &m) != nil {
		return ""
	}
	return m.Type
}

func cloneBytes(b []byte) []byte {
	c := make([]byte, len(b))
	copy(c, b)
	return c
}

// MemoryRecorder keeps each board's stroke ops in memory. A "clear" drops the
// board's history. State is not shared between processes, so it only gives
// catch-up on a single node — good enough for local dev.
type MemoryRecorder struct {
	mu  sync.Mutex
	ops map[string][][]byte
}

// NewMemory returns an empty in-memory recorder.
func NewMemory() *MemoryRecorder {
	return &MemoryRecorder{ops: make(map[string][][]byte)}
}

func (m *MemoryRecorder) Record(boardID string, payload []byte) {
	switch opType(payload) {
	case "add", "erase", "draw":
		// Durable board ops, replayed in order on catch-up: "add" places an
		// object, "erase" removes objects by id, "draw" is a legacy stroke
		// segment. ("clear" wipes; "cursor"/"hello" are transient.)
		m.mu.Lock()
		m.ops[boardID] = append(m.ops[boardID], cloneBytes(payload))
		m.mu.Unlock()
	case "clear":
		m.mu.Lock()
		delete(m.ops, boardID)
		m.mu.Unlock()
	}
}

func (m *MemoryRecorder) Catchup(boardID string) [][]byte {
	m.mu.Lock()
	defer m.mu.Unlock()
	src := m.ops[boardID]
	out := make([][]byte, len(src))
	copy(out, src)
	return out
}
