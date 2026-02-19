# DevHQ CLI Binaries

This directory contains the DevHQ CLI binaries for different platforms.

## How to Add Binaries

### Option 1: Add directly to repository (for small binaries <50MB)

```bash
# Copy compiled binaries here
cp /path/to/devhq-linux-amd64 public/cli/binaries/
cp /path/to/devhq-darwin-amd64 public/cli/binaries/
cp /path/to/devhq-darwin-arm64 public/cli/binaries/
cp /path/to/devhq-windows-amd64.exe public/cli/binaries/
```

### Option 2: Use GitHub Releases (for larger binaries)

1. Create a new release on GitHub
2. Upload binaries as release assets
3. Update installation scripts to point to:
   ```
   https://github.com/YOUR_ORG/dev-hq/releases/latest/download/devhq-linux-amd64
   ```

### Option 3: Host on external CDN

1. Upload binaries to a CDN (e.g., Cloudflare R2, AWS S3)
2. Update the `BINARY_URL` in each installation script

## Current Binaries

### Latest Version: v1.3.0

**What's New in v1.3.0:**
- **Major:** Intelligent activity monitoring with work-type awareness
  - Tracks actual file changes and git commits (not just heartbeats)
  - Different inactivity thresholds for different work types (research: 2hrs, feature: 30min, etc.)
  - Prevents tracking time when working on different projects
- **Fixed:** Database locking issues with SQLite (enabled WAL mode)
- **Added:** Tracking scope warning when starting from subdirectory
- **Added:** `work_type` and `last_activity_time` database columns
- **Enhanced:** Activity detection via filesystem watcher (fsnotify) and git monitoring

**Available Platforms:**
- `devhq-v1.3.0-linux-amd64` - Linux x86_64
- `devhq-v1.3.0-linux-arm64` - Linux ARM64  
- `devhq-v1.3.0-darwin-amd64` - macOS Intel
- `devhq-v1.3.0-darwin-arm64` - macOS Apple Silicon (M1/M2/M3)
- `devhq-v1.3.0-windows-amd64.exe` - Windows x86_64
- `devhq-v1.3.0-windows-arm64.exe` - Windows ARM64

**Symlinks (always point to latest):**
- `devhq-linux-amd64` → `devhq-v1.3.0-linux-amd64`
- `devhq-linux-arm64` → `devhq-v1.3.0-linux-arm64`
- `devhq-darwin-amd64` → `devhq-v1.3.0-darwin-amd64`
- `devhq-darwin-arm64` → `devhq-v1.3.0-darwin-arm64`
- `devhq-windows-amd64.exe` → `devhq-v1.3.0-windows-amd64.exe`
- `devhq-windows-arm64.exe` → `devhq-v1.3.0-windows-arm64.exe`

## Placeholder Files

Until you have compiled binaries, you can create placeholder files:

```bash
echo "Binary not yet available" > devhq-linux-amd64
echo "Binary not yet available" > devhq-darwin-amd64
echo "Binary not yet available" > devhq-darwin-arm64
echo "Binary not yet available" > devhq-windows-amd64.exe
```
