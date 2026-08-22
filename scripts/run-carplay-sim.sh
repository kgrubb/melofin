#!/usr/bin/env bash
# Full CarPlay-on-Simulator setup. Logs to /tmp/melofin-carplay-setup.log
set -euo pipefail
LOG=/tmp/melofin-carplay-setup.log
exec > >(tee "$LOG") 2>&1

export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
ulimit -n 65536

ROOT=/Users/madisongrubb/code/melofin
SIM=A0A9DDD8-90D0-42B1-869C-CA603AA78125
cd "$ROOT"

echo "=== $(date) melofin carplay sim setup ==="
echo "features.json=$(cat features.json)"

# Ensure flag on
python3 -c '
import json
from pathlib import Path
p=Path("features.json")
d=json.loads(p.read_text())
d["CARPLAY_ENABLED"]=True
p.write_text(json.dumps(d, indent=2)+"\n")
print("CARPLAY_ENABLED=true")
'

echo "==> quit standalone CarPlay Simulator"
osascript -e 'quit app "CarPlay Simulator"' 2>/dev/null || killall "CarPlay Simulator" 2>/dev/null || true

echo "==> start Metro if needed"
if ! curl -sf http://127.0.0.1:8081/status >/dev/null; then
  ulimit -n 65536
  nohup npm start > /tmp/melofin-metro.log 2>&1 &
  echo "metro pid $!"
  for i in $(seq 1 60); do
    if curl -sf http://127.0.0.1:8081/status >/dev/null; then
      echo "metro up"
      break
    fi
    sleep 1
  done
fi
curl -s http://127.0.0.1:8081/status || { echo "FATAL: metro down"; exit 1; }
echo

echo "==> boot Simulator"
xcrun simctl boot "$SIM" 2>/dev/null || true
open -a Simulator
xcrun simctl bootstatus "$SIM" -b
echo "sim booted"

echo "==> build+install Melofin (no pods, no second metro)"
npx expo run:ios --device "$SIM" --no-install --no-bundler

echo "==> verify app installed"
xcrun simctl get_app_container "$SIM" app.melofin.player || xcrun simctl get_app_container "$SIM" app.melio.player || true
xcrun simctl launch "$SIM" app.melofin.player || xcrun simctl launch "$SIM" app.melio.player

# Try to open CarPlay external display via AppleScript (menu varies by Xcode)
echo "==> open CarPlay external display"
osascript <<'EOF' || true
tell application "Simulator" to activate
delay 1
tell application "System Events"
  tell process "Simulator"
    set frontmost to true
    try
      click menu item "CarPlay" of menu 1 of menu item "External Displays" of menu 1 of menu bar item "I/O" of menu bar 1
    on error
      try
        click menu item "CarPlay" of menu 1 of menu bar item "Features" of menu bar 1
      on error
        try
          click menu item "CarPlay" of menu 1 of menu item "External Displays" of menu 1 of menu bar item "Window" of menu bar 1
        end try
      end try
    end try
  end tell
end tell
EOF

sleep 2
echo "==> windows check"
osascript -e 'tell application "System Events" to get name of every window of process "Simulator"' 2>/dev/null || true

echo "=== SETUP_DONE $(date) ==="
echo "Log in to Jellyfin inside the sim, then confirm Melofin on the CarPlay window under Audio."
