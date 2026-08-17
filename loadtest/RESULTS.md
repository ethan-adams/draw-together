# Load test results

What Draw does under load, measured, not guessed.

## Setup

- **Cluster:** local 3-node `kind` cluster (1 control-plane + 2 workers). All three
  nodes are containers on a **single 2-CPU virtual machine**, so the whole cluster shares
  ~2 real cores. $0 of cloud.
- **App:** 3 stateless gateway replicas (1 CPU limit each), Redis for fan-out, Postgres for
  persistence.
- **Load generator:** k6 running **inside the cluster** as a Job, hitting the gateway
  Service directly, so the measurement isn't distorted by the host's port-forward proxy
  (which, notably, is exactly what caps a naive `localhost` test).
- **Traffic shape:** clients sharded into rooms of 20 (the realistic model: many small
  boards), each drawing ~5 strokes/sec. Every stroke carries a send timestamp; receivers
  measure `now − sent`. The one-time catch-up replay on join is excluded, so the number is
  live broadcast latency, not history replay.

## Headline

**500 concurrent clients: p95 34 ms, p99 66 ms, max 296 ms, zero errors.**

| Concurrent clients | p50 | p95 | p99 | max | connect errors |
|---:|---:|---:|---:|---:|---:|
| 500  | 9 ms | 34 ms | 66 ms | 296 ms | 0 |
| 3000 | ~250 ms | ~1.7 s | ~1.9 s+ | n/a | 0 |

At **500** the cluster is comfortable: sub-70 ms p99. The gateway still **accepts 3,000
concurrent connections with zero connection errors** (the app never refuses or drops
clients), but broadcast latency climbs into the 1-2 s range as the shared 2-CPU VM
saturates. (The 3,000 row was measured before the latency window was widened, so those
values are a floor: the true tail is higher.)

## Where the bottleneck is

It's **CPU, on a single 2-CPU VM**, not the design. Fan-out is the hot path: at 3,000
clients in rooms of 20, every stroke is delivered to ~19 others, so a few thousand inbound
strokes/sec become a few hundred thousand deliveries/sec. On ~2 cores that's the ceiling,
and past it, the Kubernetes control plane, the gateways, and the load generator all fight
for the same two cores (push hard enough and even `kubectl` times out).

The point of the architecture is that this ceiling **moves with cores**: the gateways are
stateless and share state through Redis, so more replicas on more real CPUs raise the number
with no code change. On this 2-CPU laptop VM that headroom doesn't exist; on multi-core
nodes it does. What's proven here is the shape (correct fan-out, zero connection errors, flat
low latency until CPU-bound) and the method, not a hardware-specific trophy number.

## Reproduce

```bash
make kind-up                        # 3-node cluster + Redis + Postgres + 3 gateways
make k8s-loadtest CONNS=500         # in-cluster k6; try 1000, 2000, ...
make kind-down                      # clean up
```
