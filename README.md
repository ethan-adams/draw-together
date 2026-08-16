# LiveBoard

A real-time collaborative whiteboard built to scale **horizontally**: any number of
stateless gateway nodes serve one shared board, and an edit made on one node reaches
everyone on every other node.

> _[ gif goes here — two browsers drawing on one board, served by two different nodes ]_

**Headline (measured, filled in after the load test):** _N stateless nodes · one board ·
~X,000 concurrent WebSocket clients · p99 broadcast latency ~Y ms — on a local 3-node
`kind` cluster, $0 of cloud._

## Why it's interesting

- **Stateless fan-out.** Gateway nodes hold no authoritative state. Membership and
  cross-node delivery run through Redis pub/sub, so you scale by adding replicas — no
  sticky sessions, no node is special.
- **Two transports on purpose.** GraphQL handles the cold path (sign in, list boards,
  load a snapshot). Raw WebSocket handles the hot path (cursors and strokes at pointer
  speed). The [decision doc](DECISIONS.md) explains why the 60fps stream does **not** go
  through GraphQL subscriptions.
- **Convergence, not locking.** Concurrent edits resolve with a per-object last-write-wins
  CRDT, so two people editing the same shape end up in the same state without a coordinator.
- **Fast catch-up.** A late joiner loads a snapshot plus the tail of an op log instead of
  replaying all of history.

## Stack

Go (WebSocket gateway) · Redis (pub/sub + presence) · Postgres (snapshots + op log) ·
GraphQL (control plane) · React + Canvas (client) · Kubernetes on `kind` · k6 (load test).

## Quick start (single node, today)

Needs only Go and a browser.

```bash
make dev          # starts the gateway on http://localhost:8080
```

Open **http://localhost:8080** in two browser windows, keep the board name the same, and
draw — strokes and cursors sync live. (At this stage both windows talk to one node; the
Redis fan-out that makes _multiple_ nodes share a board is the next step.)

## Status

Built in visible steps — see the [roadmap in ARCHITECTURE.md](ARCHITECTURE.md#build-steps).
Current: single-node gateway + live canvas. Next: Redis pub/sub across nodes.

## License

MIT — see [LICENSE](LICENSE).
