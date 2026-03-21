#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
FLOATIE_DIR="$SCRIPT_DIR/../macos/DayflowFloatie"
APP_NAME="DayflowFloatie"
INSTALL_DIR="$HOME/Applications"

echo "Building $APP_NAME (release)…"
cd "$FLOATIE_DIR"
swift build -c release

mkdir -p "$INSTALL_DIR"

APP_BUNDLE="$INSTALL_DIR/$APP_NAME.app"
echo "Installing to $APP_BUNDLE…"

# Remove any previous install
rm -rf "$APP_BUNDLE"
mkdir -p "$APP_BUNDLE/Contents/MacOS"

# Copy binary
cp ".build/release/$APP_NAME" "$APP_BUNDLE/Contents/MacOS/$APP_NAME"

# Write Info.plist — LSUIElement keeps it out of the Dock (menu-bar only app)
cat > "$APP_BUNDLE/Contents/Info.plist" << 'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key>
    <string>DayflowFloatie</string>
    <key>CFBundleIdentifier</key>
    <string>com.dayflow.floatie</string>
    <key>CFBundleName</key>
    <string>DayflowFloatie</string>
    <key>CFBundleDisplayName</key>
    <string>Dayflow Floatie</string>
    <key>CFBundleShortVersionString</key>
    <string>1.0</string>
    <key>CFBundleVersion</key>
    <string>1</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>NSPrincipalClass</key>
    <string>NSApplication</string>
    <key>LSUIElement</key>
    <true/>
    <key>NSHighResolutionCapable</key>
    <true/>
    <key>LSMinimumSystemVersion</key>
    <string>12.0</string>
</dict>
</plist>
PLIST

# PkgInfo is required for macOS to recognise the bundle as an app
printf 'APPL????' > "$APP_BUNDLE/Contents/PkgInfo"

echo "Launching $APP_NAME…"
open "$APP_BUNDLE"

echo ""
echo "✓ Done! DayflowFloatie is now installed in ~/Applications."
echo ""
echo "Next steps (one time only):"
echo "  1. A setup dialog will ask for your Dayflow URL — enter your Railway URL"
echo "  2. Click ⏱ in the menu bar → 'Launch at Login' to enable auto-start"
echo ""
echo "After that, the floatie starts automatically every time you log in."
