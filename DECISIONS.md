# Decisions

Short records of the tradeoffs that actually shaped Draw.

## ADR 1: The hub is a content-agnostic byte relay

**Decision:** the gateway moves opaque payloads between clients on a board and never parses
the drawing protocol.

**Why:** the fan-out is the hot path. Keeping it a plain "deliver these bytes to this board"
means (a) the CPU cost per message is buffer copies, not JSON parsing, and (b) swapping
in-process delivery for Redis pub/sub is a drop-in. Publishing bytes to a channel is the
same operation. Semantics (draw/cursor/clear) live in the client and, later, in the
persistence layer that folds ops into snapshots, not in the relay.

## ADR 2: Best-effort delivery on the hot path

**Decision:** if a client's send buffer is full, drop the frame instead of blocking the board.

**Why:** Draw values freshness over guaranteed delivery. A missed intermediate stroke is
corrected by the next point; a client that fell far behind is repaired by loading a snapshot,
not by replaying a backlog. Blocking every fast client to wait on one slow one is the worse
failure. The cost is documented, not hidden: the drop is where reliability would otherwise go.

## ADR 3: GraphQL for the cold path, raw WebSocket for the hot path

**Decision:** two transports. GraphQL for auth, listing/creating boards, and loading a
snapshot; raw WebSocket for cursors and strokes.

**Why:** cursors move at pointer speed, tens of messages per second per client. Pushing that
through GraphQL subscriptions pays query-plan and envelope overhead on every frame for no
benefit; there's nothing to select, it's a firehose of tiny fixed-shape ops. GraphQL earns its
keep on the requests that are infrequent, typed, and worth caching. Using the right tool for
each path is the point, and it's a more honest signal than forcing one transport to do both.

## ADR 4: Redis pub/sub for cross-node fan-out

**Decision:** nodes coordinate through Redis pub/sub rather than node-to-node connections or a
sticky load balancer.

**Why:** it keeps nodes stateless and interchangeable, the property that makes horizontal
scale work. A client can land on any node; the node subscribes to the board's channel and gets
every edit. Tradeoff: Redis is a shared dependency and a scaling axis of its own (channels,
throughput), which the load-test step measures rather than assumes.

Three details make it behave:

- **Publish local-first, then Redis.** A node delivers a message to its own clients
  immediately, then publishes it for the others. Same-node peers don't pay a Redis round trip.
- **Skip your own echo.** Every frame is tagged with the origin node's id; a node ignores the
  frames it published itself, so nothing is delivered twice.
- **Subscribe only to boards you host.** Subscriptions are ref-counted: a node listens to a
  board's channel while it has clients there and drops it when the last one leaves. A node never
  carries traffic for boards it isn't serving. Without that, "just subscribe to everything"
  would quietly cap how far it scales.

## ADR 5: Persistence lives off the hot path

**Decision:** store durable ops (strokes, clears, not cursors) in Postgres, but never write on
the request path. A recorder enqueues; a single background writer batches inserts. A client
joining late replays the board's ops from Postgres, so catch-up works on any node.

**Why:** the drawing path handles many messages per second per client; a synchronous database
write per stroke would gate throughput and pollute the load-test latency numbers. Batching turns
a flood of tiny inserts into a few array inserts. The writer sheds under overload rather than
blocking a client: the same best-effort stance as delivery, and a dropped stroke is corrected
by the next one. The origin node is the only one that records (remote copies arrive via the
broadcaster, which doesn't persist), so each op is stored exactly once. Cursors are presence, not
history, so they're never written. Compaction (folding the op log into periodic snapshots) is the
next optimization once boards get long. The interface already hides it from callers.
