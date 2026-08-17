package store

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"fmt"
	"sort"
	"strings"
	"time"
)

// BoardInfo is a board as the control plane sees it: identity, title, and a
// couple of cheap activity stats derived from the op log.
type BoardInfo struct {
	ID           string
	Title        string
	ObjectCount  int
	LastActiveAt *time.Time
	CreatedAt    time.Time
}

// BoardRegistry is the cold-path view of boards behind the GraphQL API:
// list/create/get named boards. Ad-hoc boards opened by a raw ?board= URL are
// not registered here — the lobby lists the named ones.
type BoardRegistry interface {
	ListBoards(ctx context.Context) ([]BoardInfo, error)
	GetBoard(ctx context.Context, id string) (*BoardInfo, error)
	CreateBoard(ctx context.Context, title string) (BoardInfo, error)
}

// A readable, URL-safe id: a slug of the title plus a short random suffix so
// two boards can share a title without colliding.
func newBoardID(title string) string {
	slug := slugify(title)
	if slug == "" {
		slug = "board"
	}
	return slug + "-" + randSuffix()
}

func slugify(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	var b strings.Builder
	prevDash := false
	for _, r := range s {
		switch {
		case (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9'):
			b.WriteRune(r)
			prevDash = false
		case b.Len() > 0 && !prevDash:
			b.WriteByte('-')
			prevDash = true
		}
	}
	out := strings.Trim(b.String(), "-")
	if len(out) > 32 {
		out = strings.Trim(out[:32], "-")
	}
	return out
}

func randSuffix() string {
	var buf [4]byte
	_, _ = rand.Read(buf[:])
	return fmt.Sprintf("%x", buf[:])
}

// ---- MemoryRecorder (dev) ----

func (m *MemoryRecorder) CreateBoard(_ context.Context, title string) (BoardInfo, error) {
	bi := BoardInfo{ID: newBoardID(title), Title: strings.TrimSpace(title), CreatedAt: time.Now().UTC()}
	m.mu.Lock()
	m.boards[bi.ID] = bi
	m.mu.Unlock()
	return bi, nil
}

func (m *MemoryRecorder) GetBoard(_ context.Context, id string) (*BoardInfo, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	bi, ok := m.boards[id]
	if !ok {
		return nil, nil
	}
	bi.ObjectCount = m.countObjectsLocked(id)
	return &bi, nil
}

func (m *MemoryRecorder) ListBoards(_ context.Context) ([]BoardInfo, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := make([]BoardInfo, 0, len(m.boards))
	for id, bi := range m.boards {
		bi.ObjectCount = m.countObjectsLocked(id)
		out = append(out, bi)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].CreatedAt.After(out[j].CreatedAt) })
	return out, nil
}

// countObjectsLocked approximates a board's size as the number of distinct
// object ids ever added. Caller holds m.mu.
func (m *MemoryRecorder) countObjectsLocked(id string) int {
	seen := map[string]struct{}{}
	for _, raw := range m.ops[id] {
		var msg struct {
			Type string `json:"type"`
			Obj  struct {
				ID string `json:"id"`
			} `json:"obj"`
		}
		if json.Unmarshal(raw, &msg) == nil && msg.Type == "add" && msg.Obj.ID != "" {
			seen[msg.Obj.ID] = struct{}{}
		}
	}
	return len(seen)
}

// ---- PostgresRecorder (shared) ----

func (p *PostgresRecorder) CreateBoard(ctx context.Context, title string) (BoardInfo, error) {
	title = strings.TrimSpace(title)
	id := newBoardID(title)
	var createdAt time.Time
	err := p.pool.QueryRow(ctx,
		`INSERT INTO boards (id, title) VALUES ($1, $2) RETURNING created_at`, id, title,
	).Scan(&createdAt)
	if err != nil {
		return BoardInfo{}, err
	}
	return BoardInfo{ID: id, Title: title, CreatedAt: createdAt}, nil
}

// board list/get share this projection: each board left-joined to cheap
// per-board stats (distinct objects added, last activity) from the op log.
const boardSelect = `
SELECT b.id, b.title, b.created_at,
       COALESCE(a.objs, 0) AS objs,
       a.last_active
FROM boards b
LEFT JOIN (
    SELECT board_id,
           count(DISTINCT op->'obj'->>'id') FILTER (WHERE op->>'type' = 'add') AS objs,
           max(created_at) AS last_active
    FROM board_ops
    GROUP BY board_id
) a ON a.board_id = b.id`

func scanBoard(row interface{ Scan(...any) error }) (BoardInfo, error) {
	var bi BoardInfo
	var last *time.Time
	if err := row.Scan(&bi.ID, &bi.Title, &bi.CreatedAt, &bi.ObjectCount, &last); err != nil {
		return BoardInfo{}, err
	}
	bi.LastActiveAt = last
	return bi, nil
}

func (p *PostgresRecorder) GetBoard(ctx context.Context, id string) (*BoardInfo, error) {
	row := p.pool.QueryRow(ctx, boardSelect+` WHERE b.id = $1`, id)
	bi, err := scanBoard(row)
	if err != nil {
		return nil, nil // not found (or scan error) → treat as absent
	}
	return &bi, nil
}

func (p *PostgresRecorder) ListBoards(ctx context.Context) ([]BoardInfo, error) {
	rows, err := p.pool.Query(ctx, boardSelect+` ORDER BY COALESCE(a.last_active, b.created_at) DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []BoardInfo
	for rows.Next() {
		bi, err := scanBoard(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, bi)
	}
	return out, rows.Err()
}
