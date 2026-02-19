#!/bin/sh
set -e

# Version - this should match the CLI version
VERSION="1.4.3"

# Detect architecture
ARCH=$(uname -m)
case $ARCH in
    x86_64)
        ARCH="amd64"
        ;;
    aarch64)
        ARCH="arm64"
        ;;
    *)
        echo "Unsupported architecture: $ARCH"
        exit 1
        ;;
esac

# Download binary
BINARY_URL="https://www.devhq.site/cli/devhq-v${VERSION}-linux-${ARCH}"

# Determine install directory
# If devhq exists in /usr/local/bin, prefer updating that one
if [ -f "/usr/local/bin/devhq" ]; then
    INSTALL_DIR="/usr/local/bin"
    USE_SUDO="true"
else
    INSTALL_DIR="$HOME/.local/bin"
    USE_SUDO="false"
fi

BINARY_PATH="$INSTALL_DIR/devhq"

# Print version header
echo "DevHQ CLI ${VERSION}"

# Create install directory (only if using local bin)
if [ "$USE_SUDO" = "false" ]; then
    mkdir -p "$INSTALL_DIR"
fi

# Remove existing binary if it exists (to allow updates)
if [ -f "$BINARY_PATH" ]; then
    if [ "$USE_SUDO" = "true" ]; then
        sudo rm "$BINARY_PATH"
    else
        rm "$BINARY_PATH"
    fi
fi

# Download with progress bar
echo "Downloading to $BINARY_PATH..."
if [ "$USE_SUDO" = "true" ]; then
    echo "Administrator privileges required to update system binary..."
    sudo curl -L --progress-bar "$BINARY_URL" -o "$BINARY_PATH"
    sudo chmod +x "$BINARY_PATH"
else
    curl -L --progress-bar "$BINARY_URL" -o "$BINARY_PATH"
    chmod +x "$BINARY_PATH"
fi

# Verify permissions
echo "File permissions:"
ls -l "$BINARY_PATH"

echo "Downloaded successfully"

# Check for version mismatch due to PATH precedence
CURRENT_LOC=$(command -v devhq 2>/dev/null || echo "")
if [ -n "$CURRENT_LOC" ] && [ "$CURRENT_LOC" != "$BINARY_PATH" ]; then
    echo ""
    echo "WARNING: Found another 'devhq' binary at: $CURRENT_LOC"
    echo "The new version (v$VERSION) was installed to: $BINARY_PATH"
    echo "Your shell is prioritizing the old version."
    echo ""
    echo "To fix this, either:"
    echo "1. Remove the old version: rm $CURRENT_LOC"
    echo "2. Or run the new one directly: $BINARY_PATH --version"
fi

# Add to PATH if not already there
case ":$PATH:" in
    *":$INSTALL_DIR:"*)
        # Already in PATH
        ;;
    *)
        echo ""
        echo "Add the following to your shell profile (~/.bashrc, ~/.zshrc, etc.):"
        echo "export PATH=\"$HOME/.local/bin:$PATH\""
        ;;
esac

echo ""
echo "DevHQ CLI installed successfully!"
echo "Run 'devhq --version' to verify installation"
echo ""
echo "Next steps:"
echo "1. Get your API token from https://www.devhq.site/integrations"
echo "2. Configure: devhq config"
echo "3. Start tracking: devhq start TRACKING_CODE"

