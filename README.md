# Draw

A real-time collaborative **diagram canvas** built to scale **horizontally**: sketch
shapes, connectors, and freehand ink on a shared, infinite board — and any number of
stateless gateway nodes serve it, so an edit made on one node reaches everyone on
every other node.

![Draw — two people drawing on one shared board in real time, with live cursors and presence](docs/demo.gif)

**Measured on a local 3-node `kind` cluster (a single 2-CPU VM, $0 cloud):** 500 concurrent
WebSocket clients held at **p95 34 ms · p99 66 ms broadcast latency, zero errors**. The gateway
accepts **3,000 concurrent connections with zero connection errors**; latency then grows as the
2-CPU VM saturates — fan-out is CPU-bound, and the stateless design scales out with more cores.
Full method, numbers, and bottleneck analysis: **[loadtest/RESULTS.md](loadtest/RESULTS.md)**.

## Why it's interesting

- **Stateless fan-out.** Gateway nodes hold no authoritative state. Membership and
  cross-node delivery run through Redis pub/sub, so you scale by adding replicas — no
  sticky sessions, no node is special.
- **Two transports on purpose.** Raw WebSocket carries the hot path today — cursors,
  shapes, and ink at pointer speed. A GraphQL control plane (sign in, list/load boards)
  is the planned cold path. The [decision doc](DECISIONS.md) explains why the 60fps
  stream does **not** go through GraphQL subscriptions.
- **Ordered op log, not locking.** Every change is an id'd operation — add an object,
  erase objects, clear — relayed to peers and appended to a per-board log. A late joiner,
  on any node, replays that log to reach the exact same board, with no coordinator.
- **Fast catch-up.** A late joiner replays the board's op log (snapshot compaction is a
  planned optimization) instead of re-deriving state from scratch.
- **Designed, not themed.** A small, documented design system: tokens as the single
  source of truth and a two-material rule (a solid neutral board, one glass material for
  the floating chrome — kept off the repainting canvas so drawing stays smooth). See
  **[DESIGN.md](DESIGN.md)**.

## Stack

Go (WebSocket gateway) · Redis (pub/sub + presence) · Postgres (op log) ·
React + TypeScript + Canvas (client) · Kubernetes on `kind` · k6 (load test) ·
GraphQL control plane (planned).

## Quick start (single node)

Needs Go, Node, and a browser.

```bash
make dev          # builds the React UI, then serves it + the gateway on :8080
```

Open **http://localhost:8080** in two browser windows, keep the board name the same, and
draw — shapes, connectors, ink, cursors, and presence all sync live. Connectors **snap to
shape edges**. Scroll (or two-finger drag) to pan; pinch or **⌘/Ctrl-scroll** to zoom;
Space-drag pans with any tool.

## See it scale across nodes

Needs Docker. Brings up **two interchangeable gateway nodes + Redis + a load balancer**:

```bash
docker compose up --build     # http://localhost:8080
```

Open the URL in two windows. The load balancer round-robins them onto **different nodes**
(the corner shows `node gw1` / `node gw2`), yet they draw on the **same board** — an edit on
one node reaches clients on the other through Redis. No sticky sessions, no special node.

Boards are **durable and shared**: refresh, or join late on the other node, and the drawing
is still there — it's replayed from Postgres. Cursors stay transient (never stored).

Prove both without a browser:

```bash
go run loadtest/xnode_check.go    # live sync crosses nodes
# PASS: a stroke on node gw1 reached a client on node gw2

go run loadtest/catchup_check.go  # history survives across nodes + reconnect
# PASS: a stroke drawn on gw1 replayed to a fresh client on gw2
```

## Status

See the [build steps in ARCHITECTURE.md](ARCHITECTURE.md#build-steps).
Working today: a polished diagram canvas (shapes, edge-snapping connectors, eraser,
infinite zoom/pan) in a documented [design system](DESIGN.md), multi-node fan-out
(Redis), durable cross-node catch-up (Postgres), Kubernetes on `kind`, and a
[published load test](loadtest/RESULTS.md).
Next: a GraphQL control plane (accounts, board list).

## License

MIT — see [LICENSE](LICENSE).
