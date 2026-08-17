package store

import (
	"context"
	"log"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	writerBatch = 500                    // flush after this many buffered ops
	writerTick  = 200 * time.Millisecond // ...or at least this often
	writerQueue = 4096                   // in-flight ops before we shed load
)

// PostgresRecorder persists ops to Postgres, shared across nodes so catch-up
// works cluster-wide.
//
// Writes never touch the drawing hot path: Record only enqueues, and a single
// background writer batches inserts (unnest of arrays) on a timer. Under
// overload the queue sheds rather than blocking a client: a dropped stroke is
// corrected by the next one, same best-effort stance as delivery.
type PostgresRecorder struct {
	pool *pgxpool.Pool
	ctx  context.Context
	ch   chan pgEvent
}

type pgEvent struct {
	board string
	clear bool
	op    []byte
}

// NewPostgres connects, ensures the schema, and starts the background writer.
func NewPostgres(ctx context.Context, dsn string) (*PostgresRecorder, error) {
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		return nil, err
	}
	if err := ensureSchema(ctx, pool); err != nil {
		pool.Close()
		return nil, err
	}
	p := &PostgresRecorder{pool: pool, ctx: ctx, ch: make(chan pgEvent, writerQueue)}
	go p.writer()
	return p, nil
}

func ensureSchema(ctx context.Context, pool *pgxpool.Pool) error {
	const ddl = `
CREATE TABLE IF NOT EXISTS board_ops (
    board_id text   NOT NULL,
    seq      bigserial PRIMARY KEY,
    op       jsonb  NOT NULL
);
CREATE INDEX IF NOT EXISTS board_ops_board_seq ON board_ops (board_id, seq);
ALTER TABLE board_ops ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
CREATE TABLE IF NOT EXISTS boards (
    id         text PRIMARY KEY,
    title      text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);`
	// Nodes start together and may race on CREATE; retry a couple of times.
	var err error
	for i := 0; i < 3; i++ {
		if _, err = pool.Exec(ctx, ddl); err == nil {
			return nil
		}
		time.Sleep(300 * time.Millisecond)
	}
	return err
}

func (p *PostgresRecorder) Record(boardID string, payload []byte) {
	var ev pgEvent
	switch opType(payload) {
	case "add", "erase", "draw":
		// Durable board ops (add object / erase objects / legacy stroke).
		ev = pgEvent{board: boardID, op: cloneBytes(payload)}
	case "clear":
		ev = pgEvent{board: boardID, clear: true}
	default:
		return
	}
	select {
	case p.ch <- ev:
	default:
		// Queue full: shed rather than stall the caller.
	}
}

func (p *PostgresRecorder) writer() {
	ticker := time.NewTicker(writerTick)
	defer ticker.Stop()

	var boards, ops []string
	flush := func() {
		if len(ops) == 0 {
			return
		}
		_, err := p.pool.Exec(p.ctx,
			`INSERT INTO board_ops (board_id, op)
			 SELECT unnest($1::text[]), unnest($2::text[])::jsonb`,
			boards, ops)
		if err != nil {
			log.Printf("pg flush (%d ops): %v", len(ops), err)
		}
		boards, ops = boards[:0], ops[:0]
	}

	for {
		select {
		case ev := <-p.ch:
			if ev.clear {
				flush() // apply pending draws before wiping
				if _, err := p.pool.Exec(p.ctx, `DELETE FROM board_ops WHERE board_id=$1`, ev.board); err != nil {
					log.Printf("pg clear %s: %v", ev.board, err)
				}
				continue
			}
			boards = append(boards, ev.board)
			ops = append(ops, string(ev.op))
			if len(ops) >= writerBatch {
				flush()
			}
		case <-ticker.C:
			flush()
		}
	}
}

func (p *PostgresRecorder) Catchup(boardID string) [][]byte {
	rows, err := p.pool.Query(p.ctx,
		`SELECT op FROM board_ops WHERE board_id=$1 ORDER BY seq`, boardID)
	if err != nil {
		log.Printf("pg catchup %s: %v", boardID, err)
		return nil
	}
	defer rows.Close()

	var out [][]byte
	for rows.Next() {
		var raw []byte
		if err := rows.Scan(&raw); err != nil {
			continue
		}
		out = append(out, raw)
	}
	return out
}

// Close releases the connection pool.
func (p *PostgresRecorder) Close() { p.pool.Close() }
