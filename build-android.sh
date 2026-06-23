#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# build-android.sh
#
# Builds the web game and copies dist/index.html into the Android project's
# assets folder so the WebView can load it from file:///android_asset/.
#
# Usage:
#   ./build-android.sh
#
# Requirements:
#   - Node.js 18+
#   - npm dependencies installed (npm install)
# ---------------------------------------------------------------------------

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WEB_DIST="$SCRIPT_DIR/dist/index.html"
ASSETS_DIR="$SCRIPT_DIR/android/app/src/main/assets"

echo "========================================="
echo "  NEON CITY — Android Build Script"
echo "========================================="

# 1. Build the web game.
echo ""
echo "[1/3] Building web game (npm run build)..."
cd "$SCRIPT_DIR"
npm run build
echo "      ✓ dist/index.html created ($(du -h "$WEB_DIST" | cut -f1))"

# 2. Ensure assets directory exists.
echo ""
echo "[2/3] Preparing Android assets..."
mkdir -p "$ASSETS_DIR"

# 3. Copy the single-file build into assets.
echo ""
echo "[3/3] Copying dist/index.html -> assets/index.html..."
cp -f "$WEB_DIST" "$ASSETS_DIR/index.html"
echo "      ✓ Copied to $ASSETS_DIR/index.html"

echo ""
echo "========================================="
echo "  Done! Next steps:"
echo ""
echo "  1. Open the 'android/' folder in Android Studio."
echo "  2. Wait for Gradle sync."
echo "  3. Connect a phone (or use the emulator)."
echo "  4. Click Run (▶)."
echo ""
echo "  To load from a URL instead of the bundled file,"
echo "  edit MainActivity.java and change the loadUrl()"
echo "  call to your deployed URL (e.g. Render)."
echo "========================================="
