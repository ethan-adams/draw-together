# The GraphQL control plane

Draw has **two transports on purpose**, and this doc is about the quieter one.

- **Hot path — raw WebSocket.** Cursors, strokes, shapes: many messages per
  second per client. It stays a lean byte relay. You never want this going
  through GraphQL.
- **Cold path — GraphQL.** The rare, typed calls: *list boards, look one up,
  create one.* That's what lives here, at **`/graphql`**.

Keeping them separate is the whole point — see [DECISIONS.md](DECISIONS.md) for
why the 60fps stream is not GraphQL subscriptions.

## The schema

```graphql
type Board @key(fields: "id") {
  id: ID!
  title: String!
  objectCount: Int!      # distinct objects ever added — a rough size
  lastActiveAt: String   # RFC3339, or null if nothing drawn yet
  createdAt: String!
}

type Query {
  boards: [Board!]!
  board(id: ID!): Board
}

type Mutation {
  createBoard(title: String!): Board!
}
```

The one line that matters most is `@key(fields: "id")`. It marks `Board` as a
**federation entity**: a board can be referenced by its `id` from *another*
GraphQL service, which is what lets many small graphs compose into one big graph
(next section).

## Try it

The server ships an interactive playground. With the app running
(`make dev`), open **http://localhost:8080/graphql/playground** and run:

```graphql
mutation { createBoard(title: "System design — auth") { id } }
query    { boards { id title objectCount lastActiveAt } }
```

Or from the terminal:

```bash
curl -s localhost:8080/graphql -H 'content-type: application/json' \
  -d '{"query":"{ boards { id title objectCount } }"}'
```

The **lobby** (the app's home page, when there's no `?board=` in the URL) is
just a thin client over these two operations: it renders the `boards` query as
cards and calls `createBoard` when you name one. Open a board and the drawing
switches to the WebSocket hot path.

## How it's wired

- The schema is served by a **[gqlgen](https://gqlgen.com) subgraph** that lives
  *inside* the Go gateway — no separate process. Resolvers read and write a small
  **board registry** (`internal/store`): a `boards` table in Postgres (or an
  in-memory map for `make dev`), plus a couple of cheap stats derived from the op
  log.
- `internal/gql/schema.graphqls` is the source of truth; `go run
  github.com/99designs/gqlgen generate` produces the typed plumbing, and the
  resolvers in `internal/gql/*.resolvers.go` are the only hand-written glue.

## The bigger picture: one subgraph of a supergraph

This service is deliberately a **subgraph**, not a standalone API. The idea is
that each tool in a family exposes its own subgraph, and a lightweight **router**
composes them into a single **supergraph** that a portfolio homepage can query
in one shot:

```
              homepage
                 │ one query
                 ▼
            ┌─────────┐
            │ router  │   composes the supergraph
            └────┬────┘
        ┌────────┼────────┐
        ▼        ▼        ▼
    ┌───────┐ ┌──────┐ ┌───────┐
    │ Draw  │ │ tool │ │ tool  │   each owns its own subgraph
    │  ⬅ you │ │  …   │ │  …    │
    └───────┘ └──────┘ └───────┘
```

Because `Board` is an entity (`@key`), the router can hand a board id to another
subgraph and stitch in fields that subgraph owns. For Draw on its own, the
control plane is small — that's honest. Its value is the *pattern*: a typed cold
path beside the raw hot path, ready to federate.
