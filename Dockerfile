# 1) Build the React UI to static assets.
FROM node:24-alpine AS web
WORKDIR /web
COPY web/package.json web/package-lock.json* ./
RUN npm install
COPY web/ ./
RUN npm run build

# 2) Build a small static gateway binary.
FROM golang:1.25-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o /out/gateway ./cmd/gateway

# 3) Minimal runtime image with the binary + built UI.
FROM alpine:3.20
WORKDIR /app
RUN apk add --no-cache wget
COPY --from=build /out/gateway /app/gateway
COPY --from=web /web/dist /app/web
ENV WEB_DIR=/app/web
EXPOSE 8080
HEALTHCHECK --interval=5s --timeout=3s --retries=5 \
  CMD wget -qO- http://localhost:8080/healthz || exit 1
ENTRYPOINT ["/app/gateway"]
