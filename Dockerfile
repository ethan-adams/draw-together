# Build a small static gateway binary, then ship it on a minimal base.
FROM golang:1.25-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o /out/gateway ./cmd/gateway

FROM alpine:3.20
WORKDIR /app
RUN apk add --no-cache wget
COPY --from=build /out/gateway /app/gateway
COPY web /app/web
ENV WEB_DIR=/app/web
EXPOSE 8080
HEALTHCHECK --interval=5s --timeout=3s --retries=5 \
  CMD wget -qO- http://localhost:8080/healthz || exit 1
ENTRYPOINT ["/app/gateway"]
