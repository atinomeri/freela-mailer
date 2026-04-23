#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

CI_MODE="false"
if [[ "${1:-}" == "--ci" ]]; then
  CI_MODE="true"
fi

COMPOSE=(docker compose -p freela-mailer -f docker-compose.yml)
ENABLE_EDGE_CADDY="${ENABLE_EDGE_CADDY:-false}"
if [[ -f .env ]]; then
  ENV_EDGE_FLAG="$(awk -F= '$1=="ENABLE_EDGE_CADDY" {print $2; exit}' .env | tr -d '\r' | tr '[:upper:]' '[:lower:]')"
  if [[ -n "${ENV_EDGE_FLAG:-}" ]]; then
    ENABLE_EDGE_CADDY="$ENV_EDGE_FLAG"
  fi
fi
if [[ "$ENABLE_EDGE_CADDY" == "true" ]]; then
  COMPOSE+=(--profile edge)
fi

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "ERROR: required command '$1' is not installed"
    exit 1
  fi
}

get_env_value() {
  local key="$1"
  awk -F= -v k="$key" '$1==k {sub(/^[[:space:]]+/, "", $2); print $2; exit}' .env
}

require_env() {
  local key="$1"
  local value
  value="$(get_env_value "$key")"
  if [[ -z "${value:-}" ]]; then
    echo "ERROR: '$key' is missing or empty in deploy/.env"
    exit 1
  fi
}

container_state() {
  local name="$1"
  docker inspect -f '{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$name" 2>/dev/null || echo "missing missing"
}

require_cmd docker
require_cmd awk

if [[ ! -f .env ]]; then
  if [[ "$CI_MODE" == "true" ]]; then
    echo "ERROR: deploy/.env is missing in CI mode"
    exit 1
  fi
  cp ../.env.example .env
  echo "Created deploy/.env from .env.example"
  echo "Fill secrets, then rerun: ./deploy.sh"
  exit 1
fi

require_env DATABASE_URL
require_env POSTGRES_DB
require_env POSTGRES_USER
require_env POSTGRES_PASSWORD
require_env MAILER_PUBLIC_URL
require_env JWT_ACCESS_SECRET
require_env JWT_REFRESH_SECRET
require_env UNSUBSCRIBE_TOKEN_SECRET
require_env INTERNAL_API_SECRET
require_env SMTP_CONFIG_SECRET
if [[ "$ENABLE_EDGE_CADDY" == "true" ]]; then
  require_env DOMAIN
fi

DB_URL="$(get_env_value DATABASE_URL)"
DB_PASS="$(get_env_value POSTGRES_PASSWORD)"
if [[ "$DB_URL" != *":${DB_PASS}@"* ]]; then
  echo "ERROR: DATABASE_URL password and POSTGRES_PASSWORD do not match"
  exit 1
fi

BUILD_SERVICES=(app worker)
APP_SERVICES=(app worker)
LOG_SERVICES=(app worker db redis)
if [[ "$ENABLE_EDGE_CADDY" == "true" ]]; then
  BUILD_SERVICES+=(caddy)
  APP_SERVICES+=(caddy)
  LOG_SERVICES+=(caddy)
fi

echo "==> Build images (${BUILD_SERVICES[*]})"
"${COMPOSE[@]}" build "${BUILD_SERVICES[@]}"

echo "==> Start dependencies (db, redis)"
"${COMPOSE[@]}" up -d db redis

echo "==> Run prisma migrate deploy"
"${COMPOSE[@]}" run --rm --no-deps app npm run -s prisma:migrate:deploy

echo "==> Start application services (${APP_SERVICES[*]})"
"${COMPOSE[@]}" up -d "${APP_SERVICES[@]}"

echo "==> Wait for healthy services"
for _ in $(seq 1 60); do
  app_state="$(container_state mailer-app)"
  worker_state="$(container_state mailer-worker)"
  db_state="$(container_state mailer-db)"
  redis_state="$(container_state mailer-redis)"
  caddy_ok="true"
  if [[ "$ENABLE_EDGE_CADDY" == "true" ]]; then
    caddy_state="$(container_state mailer-caddy)"
    if [[ "$caddy_state" != "running none" ]]; then
      caddy_ok="false"
    fi
  fi
  if [[ "$app_state" == "running healthy" ]] && \
     [[ "$worker_state" == "running healthy" ]] && \
     [[ "$db_state" == "running healthy" ]] && \
     [[ "$redis_state" == "running healthy" ]] && \
     [[ "$caddy_ok" == "true" ]]; then
    break
  fi
  sleep 3
done

echo "==> Service status"
"${COMPOSE[@]}" ps

if [[ "$(container_state mailer-app)" != "running healthy" ]] || \
   [[ "$(container_state mailer-worker)" != "running healthy" ]] || \
   [[ "$(container_state mailer-db)" != "running healthy" ]] || \
   [[ "$(container_state mailer-redis)" != "running healthy" ]]; then
  echo "ERROR: not all services reached healthy state"
  "${COMPOSE[@]}" logs --tail=120 "${LOG_SERVICES[@]}"
  exit 1
fi

echo "Deploy completed."
