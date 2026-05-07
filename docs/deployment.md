# Lore Memory Server — Deployment Guide

## Prerequisites

- Docker & Docker Compose
- A populated `.env` file (copy from `.env.example`)
- TLS certificates for HTTPS (see cert setup below)

## Quick Start

```bash
# 1. Clone and enter the repo
git clone <repo-url>
cd lore-memory-mcp

# 2. Fill in environment variables
cp .env.example .env
$EDITOR .env

# 3. Add TLS certificates for nginx
#    See "TLS Certificate Setup" below.

# 4. Start the full stack
docker compose up -d

# 5. Verify
sleep 5
curl -fsS http://localhost:3100/health | jq
curl -fsS http://localhost:3100/metrics | head -20
```

## TLS Certificate Setup

### Local Development (Self-Signed)

```bash
# Install mkcert first: https://github.com/FiloSottile/mkcert
mkcert -install
mkcert -cert-file nginx/certs/fullchain.pem -key-file nginx/certs/privkey.pem localhost
```

### Production

Drop in certificates from your organization CA or Let's Encrypt:

```bash
cp /path/to/fullchain.pem nginx/certs/
cp /path/to/privkey.pem nginx/certs/
```

> **Note:** Automated renewal is planned for post-v1.0. Cipher-list curation, TLS 1.2-only enforcement, and HSTS are deferred to Story 6.4.

## Services

| Service | Image | Ports | Purpose |
|---------|-------|-------|---------|
| `postgres` | `pgvector/pgvector:pg16` | `127.0.0.1:5432` | Primary database with pgvector extension |
| `mcp-server` | Built from `Dockerfile` | `3100` | Fastify MCP + REST API |
| `nginx` | `nginx:alpine` | `80`, `443` | TLS termination + reverse proxy |

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | — | Postgres connection string (local dev) |
| `ADMIN_SECRET` | Yes | — | Bearer token for admin endpoints |
| `POSTGRES_PASSWORD` | Yes (compose) | — | Postgres password |
| `OPENAI_API_KEY` | No | — | OpenAI API key for embeddings |
| `MCP_SERVER_PORT` | No | `3100` | HTTP port |
| `LORE_PG_VOLUME_BYTES` | No | `0` | Volume capacity for disk-usage metric |
| `LOG_LEVEL` | No | `info` | Pino log level |

## Health & Metrics

- `GET /health` — JSON health status (no auth)
- `GET /metrics` — Prometheus text format (no auth)

## Troubleshooting

**Postgres fails to start:**
Check `docker compose logs postgres`. Ensure `POSTGRES_PASSWORD` is set in `.env`.

**MCP server exits immediately:**
Check `docker compose logs mcp-server`. Likely `DATABASE_URL` or `ADMIN_SECRET` is missing.

**Migrations fail on cold start:**
The Dockerfile entrypoint runs `dist/db/migrate.js` before starting the server. If it fails, the container exits non-zero. Fix the DB connectivity and restart.

**Nginx returns 502:**
Ensure `mcp-server` is healthy (`docker compose ps`) and certificates exist in `nginx/certs/`.
