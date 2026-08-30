#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# The imported project stores its connection settings in frontend/.env.
# Use those only when Replit has not already supplied the variables. The
# process substitution also handles the file's CRLF line endings.
if [[ -z "${DATABASE_URL:-}" && -f "$ROOT_DIR/frontend/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source <(sed 's/\r$//' "$ROOT_DIR/frontend/.env")
  set +a
fi

: "${DATABASE_URL:?DATABASE_URL is required}"
export DIRECT_DATABASE_URL="${DIRECT_DATABASE_URL:-$DATABASE_URL}"
export JWT_SECRET="${JWT_SECRET:-${SESSION_SECRET:?JWT_SECRET or SESSION_SECRET is required}}"
export JWT_EXPIRES_IN="${JWT_EXPIRES_IN:-7d}"
export NODE_ENV="${NODE_ENV:-development}"
export FRONTEND_URL="${FRONTEND_URL:-http://127.0.0.1:5000}"

if [[ ! -d "$ROOT_DIR/backend/node_modules" ]]; then
  (cd "$ROOT_DIR/backend" && npm ci)
fi
if [[ ! -d "$ROOT_DIR/frontend/node_modules" ]]; then
  (cd "$ROOT_DIR/frontend" && npm ci)
fi

(cd "$ROOT_DIR/backend" && npx prisma migrate deploy && npm run prisma:seed && npm run build && PORT=5001 npm run start:prod) &
BACKEND_PID=$!

cleanup() {
  kill "$BACKEND_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

until curl -fsS http://127.0.0.1:5001/health >/dev/null 2>&1; do
  if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
    wait "$BACKEND_PID"
    exit 1
  fi
  sleep 1
done

cd "$ROOT_DIR/frontend"
exec npm run dev -- --hostname 0.0.0.0 --port 5000