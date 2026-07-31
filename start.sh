#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_PID=""
FRONTEND_PID=""

cleanup() {
  trap - INT TERM EXIT
  [[ -n "$FRONTEND_PID" ]] && kill "$FRONTEND_PID" 2>/dev/null || true
  [[ -n "$BACKEND_PID" ]] && kill "$BACKEND_PID" 2>/dev/null || true
  wait 2>/dev/null || true
}
trap cleanup INT TERM EXIT

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "Error: this bootstrap script currently supports macOS only."
  exit 1
fi

configure_homebrew() {
  if [[ -x /opt/homebrew/bin/brew ]]; then
    eval "$(/opt/homebrew/bin/brew shellenv)"
  elif [[ -x /usr/local/bin/brew ]]; then
    eval "$(/usr/local/bin/brew shellenv)"
  fi
}

configure_homebrew
if ! command -v brew >/dev/null 2>&1; then
  echo "Installing Homebrew..."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  configure_homebrew
fi

if ! command -v go >/dev/null 2>&1; then
  echo "Installing Go..."
  brew install go
fi
if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "Installing Node.js..."
  brew install node
fi

for port_number in 8080 3500; do
  if command -v lsof >/dev/null 2>&1 && lsof -nP -iTCP:"$port_number" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "Error: port $port_number is already in use. Stop that process and try again."
    exit 1
  fi
done

echo "Downloading backend dependencies..."
(cd "$ROOT_DIR/backend" && go mod download)

echo "Downloading frontend dependencies..."
(cd "$ROOT_DIR/frontend" && npm ci)

echo "Starting Merchant API at http://localhost:8080"
(cd "$ROOT_DIR/backend" && exec go run ./cmd/server) &
BACKEND_PID=$!

echo -n "Waiting for the API"
api_ready=false
for _ in $(seq 1 90); do
  if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
    echo
    echo "Error: the Merchant API stopped during startup."
    exit 1
  fi
  status_code="$(curl -sS -o /dev/null -w '%{http_code}' -X POST \
    -H 'Content-Type: application/json' -d '{}' \
    http://127.0.0.1:8080/v1/merchant/auth/login 2>/dev/null || true)"
  if [[ "$status_code" != "000" && -n "$status_code" ]]; then
    api_ready=true
    break
  fi
  echo -n "."
  sleep 1
done
echo

if [[ "$api_ready" != "true" ]]; then
  echo "Error: the Merchant API did not become ready within 90 seconds."
  exit 1
fi

echo "Starting Merchant frontend at http://localhost:3500/login"
(cd "$ROOT_DIR/frontend" && exec npm run dev) &
FRONTEND_PID=$!

echo "Both services are running. Press Ctrl+C to stop them."
wait "$BACKEND_PID" "$FRONTEND_PID"
