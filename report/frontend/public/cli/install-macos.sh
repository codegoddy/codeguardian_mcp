#!/bin/bash
set -e

# Version - this should match the CLI version
VERSION="1.4.0"

# Detect architecture
ARCH=$(uname -m)
case $ARCH in
    x86_64)
        ARCH="amd64"
        ;;
    arm64)
        ARCH="arm64"
        ;;
    *)
        echo "Unsupported architecture: $ARCH"
        exit 1
        ;;
esac

# Download binary
BINARY_URL="https://www.devhq.site/cli/devhq-v${VERSION}-darwin-${ARCH}"
INSTALL_DIR="/usr/local/bin"
BINARY_PATH="$INSTALL_DIR/devhq"

# Print version header
echo "DevHQ CLI ${VERSION}"

# Download with progress bar
echo "⠋ Downloading..."

# Try to install to /usr/local/bin (may need sudo)
if [ -w "$INSTALL_DIR" ]; then
    # Remove existing binary if it exists
    [ -f "$BINARY_PATH" ] && rm "$BINARY_PATH"
    curl -L --progress-bar "$BINARY_URL" -o "$BINARY_PATH"
    chmod +x "$BINARY_PATH"
else
    echo "Administrator privileges required..."
    # Remove existing binary if it exists
    [ -f "$BINARY_PATH" ] && sudo rm "$BINARY_PATH"
    sudo curl -L --progress-bar "$BINARY_URL" -o "$BINARY_PATH"
    sudo chmod +x "$BINARY_PATH"
fi

echo "✓ Downloaded successfully"

echo ""
echo "✅ DevHQ CLI installed successfully!"
echo "Run 'devhq --version' to verify installation"
echo ""
echo "Next steps:"
echo "1. Get your API token from https://www.devhq.site/integrations"
echo "2. Configure: devhq config"
echo "3. Start tracking: devhq start TRACKING_CODE"

