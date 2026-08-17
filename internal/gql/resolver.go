package gql

// Resolver is the dependency-injection root for the subgraph. It holds the
// board registry the resolvers read and write through.

import (
	"net/http"
	"time"

	"github.com/99designs/gqlgen/graphql/handler"
	"github.com/99designs/gqlgen/graphql/handler/extension"
	"github.com/99designs/gqlgen/graphql/handler/transport"
	"github.com/ethan-adams/draw-together/internal/store"
)

type Resolver struct {
	Reg store.BoardRegistry
}

// NewServer builds the GraphQL HTTP handler for the boards subgraph.
func NewServer(reg store.BoardRegistry) http.Handler {
	es := NewExecutableSchema(Config{Resolvers: &Resolver{Reg: reg}})
	srv := handler.New(es)
	srv.AddTransport(transport.Options{})
	srv.AddTransport(transport.GET{})
	srv.AddTransport(transport.POST{})
	srv.Use(extension.Introspection{}) // lets tools + the router discover the schema
	return srv
}

// toBoard maps a store board to the GraphQL model, rendering times as RFC3339.
func toBoard(b store.BoardInfo) *Board {
	out := &Board{
		ID:          b.ID,
		Title:       b.Title,
		ObjectCount: b.ObjectCount,
		CreatedAt:   b.CreatedAt.UTC().Format(time.RFC3339),
	}
	if b.LastActiveAt != nil {
		s := b.LastActiveAt.UTC().Format(time.RFC3339)
		out.LastActiveAt = &s
	}
	return out
}
