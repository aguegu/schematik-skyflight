#!/bin/bash
set -e
cd "$(dirname "$0")"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
URL='http://localhost:5178'

open_game() {
  for app in "$HOME/Applications/Google Chrome.app" '/Applications/Google Chrome.app' "$HOME/Applications/Microsoft Edge.app" '/Applications/Microsoft Edge.app'; do
    if [ -d "$app" ]; then
      open -a "$app" "$URL"
      return
    fi
  done
  echo 'Install Google Chrome or Microsoft Edge for USB tilt control.'
  open "$URL"
}

is_running() {
  curl -fsS --max-time 2 "$URL" 2>/dev/null | grep -q 'Schematik Flight Lab'
}

if is_running; then
  open_game
  exit 0
fi

# macOS ships Ruby + WEBrick on the target machines. Avoid /usr/bin/python3:
# on a fresh Mac that is a developer-tools installer stub, not a Python runtime.
if [ -f dist/index.html ] && /usr/bin/ruby -e 'require "webrick"' >/dev/null 2>&1; then
  SERVER=(/usr/bin/ruby "$PWD/serve.rb")
elif command -v npm >/dev/null; then
  if [ ! -d node_modules ]; then npm ci; fi
  SERVER=(npm run dev -- --port 5178 --strictPort)
else
  echo 'This Mac needs Node.js, or Ruby with WEBrick, to serve Skyflight locally.'
  read -r -p 'Press Enter to close.'
  exit 1
fi

(
  for attempt in {1..30}; do
    if is_running; then open_game; exit; fi
    sleep 1
  done
) &
echo 'Skyflight is starting. Keep this Terminal window open while flying.'
exec "${SERVER[@]}"
