#!/usr/bin/env bash
# Re-sign sim Debug builds that omit CarPlay entitlements.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENT="$ROOT/ios/Melio/Melio.entitlements"
UDID="${1:-A18F8EEA-D74E-431C-993F-697142B9B76A}"

SIMAPP="$(ls -d "$HOME"/Library/Developer/Xcode/DerivedData/Melio-*/Build/Products/Debug-iphonesimulator/Melofin.app 2>/dev/null | head -1 || true)"
[[ -n "$SIMAPP" && -d "$SIMAPP" ]] || {
  echo "No sim Melofin.app found. Run: npx expo run:ios --simulator" >&2
  exit 1
}

WORKDIR="$ROOT/.tmp/Melofin.app"
rm -rf "$ROOT/.tmp"
mkdir -p "$ROOT/.tmp"
cp -R "$SIMAPP" "$WORKDIR"
codesign -f -s - --entitlements "$ENT" "$WORKDIR/Melofin"
codesign -f -s - --entitlements "$ENT" "$WORKDIR"
xcrun simctl install "$UDID" "$WORKDIR"
xcrun simctl terminate "$UDID" app.melofin.player 2>/dev/null || true
xcrun simctl launch "$UDID" app.melofin.player
