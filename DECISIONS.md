# Decisions

Short records of the tradeoffs that actually shaped LiveBoard.

## ADR 1 — The hub is a content-agnostic byte relay

**Decision:** the gateway moves opaque payloads between clients on a board and never parses
the drawing protocol.

**Why:** the fan-out is the hot path. Keeping it a plain "deliver these bytes to this board"
means (a) the CPU cost per message is buffer copies, not JSON parsing, and (b) swapping
in-process delivery for Redis pub/sub is a drop-in — publishing bytes to a channel is the
same operation. Semantics (draw/cursor/clear) live in the client and, later, in the
persistence layer that folds ops into snapshots — not in the relay.

## ADR 2 — Best-effort delivery on the hot path

**Decision:** if a client's send buffer is full, drop the frame instead of blocking the board.

**Why:** LiveBoard values freshness over guaranteed delivery. A missed intermediate stroke is
corrected by the next point; a client that fell far behind is repaired by loading a snapshot,
not by replaying a backlog. Blocking every fast client to wait on one slow one is the worse
failure. The cost is documented, not hidden: the drop is where reliability would otherwise go.

## ADR 3 — GraphQL for the cold path, raw WebSocket for the hot path

**Decision:** two transports. GraphQL for auth, listing/creating boards, and loading a
snapshot; raw WebSocket for cursors and strokes.

**Why:** cursors move at pointer speed — tens of messages per second per client. Pushing that
through GraphQL subscriptions pays query-plan and envelope overhead on every frame for no
benefit; there's nothing to select, it's a firehose of tiny fixed-shape ops. GraphQL earns its
keep on the requests that are infrequent, typed, and worth caching. Using the right tool for
each path is the point — and it's a more honest signal than forcing one transport to do both.

## ADR 4 — Redis pub/sub for cross-node fan-out (next step)

**Decision:** nodes coordinate through Redis pub/sub rather than node-to-node connections or a
sticky load balancer.

**Why:** it keeps nodes stateless and interchangeable — the property that makes horizontal
scale work. A client can land on any node; the node subscribes to the board's channel and gets
every edit. Tradeoff: Redis is a shared dependency and a scaling axis of its own (channels,
throughput), which the load-test step measures rather than assumes.
