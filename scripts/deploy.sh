#!/usr/bin/env bash
#
# Deploy Lore on a server that runs it under docker compose.
#
#   ./scripts/deploy.sh
#
# Pulls, rebuilds, migrates, then swaps the containers — in that order, because
# migrations must run from the NEW image (it carries the new .sql files) but
# BEFORE the new code starts serving. Shipped migrations are additive, so the
# old containers keep working against the migrated database during the gap. A
# migration that drops or rewrites a column would break that assumption and
# needs a maintenance window instead of this script.
#
# If any step fails the script stops and the old containers keep running.

set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

log() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
die() { printf '\n\033[31mdeploy failed: %s\033[0m\n' "$*" >&2; exit 1; }

# --- preflight -------------------------------------------------------------
# Each check here is a failure this script has actually seen in production.

[[ -f docker-compose.yml ]] || die "run this from the repo, not $(pwd)"

# A dirty tree means `git pull` aborts halfway, leaving the repo on old code
# while the build below uses the new compose file. Fail before touching things.
[[ -z "$(git status --porcelain --untracked-files=no)" ]] ||
  die "working tree has uncommitted changes; commit or discard them first
$(git status --short --untracked-files=no)"

[[ -f .env ]] || die ".env missing at the repo root — copy .env.example and fill it in.
Compose reads it to resolve \${WEB_PORT} and \${MCP_SERVER_PORT}."

# NEXT_PUBLIC_* is inlined into the client bundle at BUILD time. Unset, the
# build silently succeeds and bakes http://localhost:3100 into the dashboard,
# which then fails only in the browser, only in production.
# `|| true` on both greps: pipefail turns "key absent" into a pipeline failure,
# and set -e would abort here with no message instead of reaching the checks.
api_url="$(grep -E '^NEXT_PUBLIC_LORE_API_URL=' .env | tail -1 | cut -d= -f2- || true)"
[[ -n "$api_url" ]] ||
  die "NEXT_PUBLIC_LORE_API_URL is not set in .env — the web build would bake in localhost"

port="$(grep -E '^MCP_SERVER_PORT=' .env | tail -1 | cut -d= -f2- || true)"
port="${port:-3100}"
health="http://127.0.0.1:${port}/health"

log "deploying $(git rev-parse --short HEAD) -> api ${api_url}"

# --- pull ------------------------------------------------------------------
log "pulling"
git pull --ff-only || die "pull was not a fast-forward; reconcile the branch by hand"

before="$(git rev-parse --short HEAD)"

# --- build -----------------------------------------------------------------
# Only the two services we own. Ollama is an upstream image and postgres sits
# behind the local-db profile, so neither is rebuilt or restarted here.
log "building images"
docker compose build mcp-server web || die "image build failed"

# --- migrate ---------------------------------------------------------------
# A one-off container from the image just built. Not `compose run`, which drags
# in depends_on services and races for their host ports.
log "running migrations"
docker run --rm \
  --env-file apps/server/.env \
  --entrypoint sh \
  lore-mcp-server:latest \
  -c 'cd /app/apps/server && node dist/db/migrate.js' ||
  die "migrations failed — containers left on the previous build, database may be partially migrated"

# --- swap ------------------------------------------------------------------
# --no-deps keeps ollama (and anything else already up) untouched.
log "recreating containers"
docker compose up -d --no-deps mcp-server web || die "container recreate failed"

# --- verify ----------------------------------------------------------------
log "waiting for health"
for i in $(seq 1 30); do
  if curl -fsS -m 5 "$health" >/dev/null 2>&1; then
    printf '\n\033[32mdeployed %s\033[0m\n' "$(git rev-parse --short HEAD)"
    curl -sS -m 5 "$health"
    echo
    docker compose ps --format 'table {{.Name}}\t{{.Status}}\t{{.Ports}}'
    exit 0
  fi
  sleep 2
done

die "no healthy response from ${health} after 60s.
  logs:     docker compose logs --tail 50 mcp-server
  rollback: git checkout ${before} && ./scripts/deploy.sh"
