#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

PORT="${PORT:-8080}"

echo "==> Checking dependencies..."

# ---- Ensure Node.js is available (auto-install if missing) ----
if ! command -v node >/dev/null 2>&1; then
  echo "==> Node.js not found, attempting install..."
  OS="$(uname -s)"

  if [ "$OS" = "Linux" ]; then
    if command -v apt-get >/dev/null 2>&1; then
      echo "==> Installing Node.js via apt-get..."
      if command -v sudo >/dev/null 2>&1; then SUDO="sudo"; else SUDO=""; fi
      $SUDO apt-get update -y
      $SUDO apt-get install -y nodejs npm
    elif command -v yum >/dev/null 2>&1; then
      echo "==> Installing Node.js via yum..."
      if command -v sudo >/dev/null 2>&1; then SUDO="sudo"; else SUDO=""; fi
      $SUDO yum install -y nodejs npm
    else
      echo "==> Falling back to nvm install..."
      export NVM_DIR="$DIR/.nvm"
      curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
      # shellcheck disable=SC1090
      \. "$NVM_DIR/nvm.sh"
      nvm install --lts
      nvm use --lts
    fi
  elif [ "$OS" = "Darwin" ]; then
    if command -v brew >/dev/null 2>&1; then
      echo "==> Installing Node.js via brew..."
      brew install node
    else
      echo "==> Falling back to nvm install..."
      export NVM_DIR="$DIR/.nvm"
      curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
      # shellcheck disable=SC1090
      \. "$NVM_DIR/nvm.sh"
      nvm install --lts
      nvm use --lts
    fi
  else
    echo "Error: unsupported OS ($OS) for auto-install. Install Node.js manually: https://nodejs.org"
    exit 1
  fi

  if ! command -v node >/dev/null 2>&1; then
    echo "Error: Node.js install failed. Install it manually from https://nodejs.org and re-run this script."
    exit 1
  fi
fi

echo "==> Node.js ready: $(node --version)"

mkdir -p "$DIR/uploads" "$DIR/.tmp-chunks"

# ---- Ensure cloudflared is available (auto-install if missing) ----
if ! command -v cloudflared >/dev/null 2>&1 && [ ! -x "$DIR/cloudflared" ]; then
  echo "==> cloudflared not found, attempting install..."
  OS="$(uname -s)"
  ARCH="$(uname -m)"

  if [ "$OS" = "Linux" ]; then
    if [ "$ARCH" = "x86_64" ]; then
      URL="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64"
    elif [ "$ARCH" = "aarch64" ] || [ "$ARCH" = "arm64" ]; then
      URL="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64"
    else
      echo "Error: unsupported architecture ($ARCH). Install cloudflared manually: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/"
      exit 1
    fi
    curl -fsSL "$URL" -o "$DIR/cloudflared"
    chmod +x "$DIR/cloudflared"
  elif [ "$OS" = "Darwin" ]; then
    if command -v brew >/dev/null 2>&1; then
      brew install cloudflared
    else
      curl -fsSL "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-amd64.tgz" -o "$DIR/cloudflared.tgz"
      tar -xzf "$DIR/cloudflared.tgz" -C "$DIR"
      chmod +x "$DIR/cloudflared"
      rm -f "$DIR/cloudflared.tgz"
    fi
  else
    echo "Error: unsupported OS ($OS). Install cloudflared manually: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/"
    exit 1
  fi
fi

if command -v cloudflared >/dev/null 2>&1; then
  CLOUDFLARED_BIN="cloudflared"
else
  CLOUDFLARED_BIN="$DIR/cloudflared"
fi

if [ ! -x "$CLOUDFLARED_BIN" ] && ! command -v "$CLOUDFLARED_BIN" >/dev/null 2>&1; then
  echo "Error: cloudflared install failed."
  exit 1
fi

echo "==> cloudflared ready"

echo "==> Starting local server on port $PORT..."
PORT="$PORT" node "$DIR/server.js" > "$DIR/server.log" 2>&1 &
SERVER_PID=$!
echo "$SERVER_PID" > "$DIR/.server.pid"

sleep 1
if ! kill -0 "$SERVER_PID" 2>/dev/null; then
  echo "Server failed to start. Check $DIR/server.log"
  cat "$DIR/server.log"
  exit 1
fi

echo "==> Local server running (PID $SERVER_PID): http://localhost:$PORT"
echo "==> Starting Cloudflare tunnel..."

"$CLOUDFLARED_BIN" tunnel --url "http://localhost:$PORT" > "$DIR/cloudflared.log" 2>&1 &
TUNNEL_PID=$!
echo "$TUNNEL_PID" > "$DIR/.tunnel.pid"

echo -n "==> Waiting for tunnel URL"
URL=""
for i in $(seq 1 30); do
  if grep -qo 'https://[a-zA-Z0-9.-]*\.trycloudflare\.com' "$DIR/cloudflared.log" 2>/dev/null; then
    URL="$(grep -o 'https://[a-zA-Z0-9.-]*\.trycloudflare\.com' "$DIR/cloudflared.log" | head -n1)"
    break
  fi
  echo -n "."
  sleep 1
done
echo ""

if [ -z "$URL" ]; then
  echo "Could not detect tunnel URL yet. Check $DIR/cloudflared.log manually."
else
  echo ""
  echo "================================================="
  echo " Local:      http://localhost:$PORT"
  echo " Public URL: $URL"
  echo "================================================="
  echo ""
fi

echo "Server PID: $SERVER_PID | Tunnel PID: $TUNNEL_PID"
echo "To stop: kill \$(cat $DIR/.server.pid) \$(cat $DIR/.tunnel.pid)"
echo "Logs: $DIR/server.log , $DIR/cloudflared.log"

wait
