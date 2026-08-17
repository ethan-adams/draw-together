package store

import "testing"

func TestMemoryRecorderKeepsBoardOpsSkipsCursors(t *testing.T) {
	m := NewMemory()
	m.Record("room", []byte(`{"type":"add","obj":{"id":"a","kind":"shape"}}`))
	m.Record("room", []byte(`{"type":"cursor","x":1,"y":1}`)) // transient: must not persist
	m.Record("room", []byte(`{"type":"erase","ids":["a"]}`))
	m.Record("room", []byte(`{"type":"draw","from":{"x":0,"y":0}}`)) // legacy stroke still kept

	if got := len(m.Catchup("room")); got != 3 {
		t.Fatalf("catchup len = %d, want 3 (add+erase+draw kept, cursor dropped)", got)
	}
}

func TestMemoryRecorderClearResets(t *testing.T) {
	m := NewMemory()
	m.Record("room", []byte(`{"type":"add","obj":{"id":"a"}}`))
	m.Record("room", []byte(`{"type":"clear"}`))

	if got := len(m.Catchup("room")); got != 0 {
		t.Fatalf("after clear, catchup len = %d, want 0", got)
	}
}

func TestCatchupReturnsACopy(t *testing.T) {
	m := NewMemory()
	m.Record("room", []byte(`{"type":"add","obj":{"id":"a"}}`))

	got := m.Catchup("room")
	got[0] = []byte("mutated")

	if again := m.Catchup("room"); string(again[0]) == "mutated" {
		t.Fatal("Catchup must return a copy; caller mutation leaked into stored state")
	}
}

func TestOpType(t *testing.T) {
	cases := map[string]string{
		`{"type":"add"}`:    "add",
		`{"type":"erase"}`:  "erase",
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
