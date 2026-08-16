package store

import "testing"

func TestMemoryRecorderKeepsDrawsSkipsCursors(t *testing.T) {
	m := NewMemory()
	m.Record("room", []byte(`{"type":"draw","from":{"x":0,"y":0}}`))
	m.Record("room", []byte(`{"type":"cursor","x":1,"y":1}`)) // transient — must not persist
	m.Record("room", []byte(`{"type":"draw","from":{"x":1,"y":1}}`))

	if got := len(m.Catchup("room")); got != 2 {
		t.Fatalf("catchup len = %d, want 2 (cursor should be dropped)", got)
	}
}

func TestMemoryRecorderClearResets(t *testing.T) {
	m := NewMemory()
	m.Record("room", []byte(`{"type":"draw"}`))
	m.Record("room", []byte(`{"type":"clear"}`))

	if got := len(m.Catchup("room")); got != 0 {
		t.Fatalf("after clear, catchup len = %d, want 0", got)
	}
}

func TestCatchupReturnsACopy(t *testing.T) {
	m := NewMemory()
	m.Record("room", []byte(`{"type":"draw"}`))

	got := m.Catchup("room")
	got[0] = []byte("mutated")

	if again := m.Catchup("room"); string(again[0]) == "mutated" {
		t.Fatal("Catchup must return a copy; caller mutation leaked into stored state")
	}
}

func TestOpType(t *testing.T) {
	cases := map[string]string{
		`{"type":"draw"}`:   "draw",
		`{"type":"cursor"}`: "cursor",
		`not json`:          "",
		`{}`:                "",
	}
	for in, want := range cases {
		if got := opType([]byte(in)); got != want {
			t.Errorf("opType(%q) = %q, want %q", in, got, want)
		}
	}
}
