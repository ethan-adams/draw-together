# Draw

A real-time collaborative **diagram canvas** built to scale **horizontally**: sketch
shapes, connectors, and freehand ink on a shared, infinite board — and any number of
stateless gateway nodes serve it, so an edit made on one node reaches everyone on
every other node.

![Draw — connecting two labeled shapes, then dragging one around while the connector stays attached and follows](docs/demo.gif)

**Measured on a local 3-node `kind` cluster (a single 2-CPU VM, $0 cloud):** 500 concurrent
WebSocket clients held at **p95 34 ms · p99 66 ms broadcast latency, zero errors**. The gateway
accepts **3,000 concurrent connections with zero connection errors**; latency then grows as the
2-CPU VM saturates — fan-out is CPU-bound, and the stateless design scales out with more cores.
Full method, numbers, and bottleneck analysis: **[loadtest/RESULTS.md](loadtest/RESULTS.md)**.

## Why it's interesting

- **Stateless fan-out.** Gateway nodes hold no authoritative state. Membership and
  cross-node delivery run through Redis pub/sub, so you scale by adding replicas — no
  sticky sessions, no node is special.
- **Two transports on purpose.** Raw WebSocket carries the hot path — cursors, shapes,
  and ink at pointer speed. A GraphQL control plane carries the cold path — list/create
  boards — served as a **federation subgraph** at `/graphql`, with the lobby as its
  client ([GRAPHQL.md](GRAPHQL.md)). The [decision doc](DECISIONS.md) explains why the
  60fps stream does **not** go through GraphQL subscriptions.
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
React + TypeScript + Canvas (client) · GraphQL (gqlgen federation subgraph) ·
Kubernetes on `kind` · k6 (load test).

## Quick start (single node)

Needs Go, Node, and a browser.

```bash
make dev          # builds the React UI, then serves it + the gateway on :8080
```

Open **http://localhost:8080** — the home page is a **lobby** (create or open a board).
Open a board's URL in a second window to draw together — shapes, connectors, text, ink,
cursors, and presence all sync live. **Select** a shape and drag it; connectors **bound to
it follow** (drop a connector end anywhere on a shape to bind it, and drag a selected
connector's ends to re-route). **Double-click a shape** to label it, or use the **Text**
tool for free-standing text. Scroll (or two-finger drag) to pan; pinch or **⌘/Ctrl-scroll**
to zoom; Space-drag pans with any tool. Toggle **light/dark** from the toolbar (it follows
your OS by default).

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
Working today: a polished diagram canvas (select/move with connector re-routing,
shapes, edge-snapping connectors, eraser, infinite zoom/pan, light/dark) in a
documented [design system](DESIGN.md); a [GraphQL control plane](GRAPHQL.md) with
a board lobby; multi-node fan-out (Redis); durable cross-node catch-up (Postgres);
Kubernetes on `kind`; and a [published load test](loadtest/RESULTS.md).
Next: per-object CRDT convergence and snapshot compaction.

## License

MIT — see [LICENSE](LICENSE).
