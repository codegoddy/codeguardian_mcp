"""CLI version management API endpoints."""

from fastapi import APIRouter

router = APIRouter(prefix="/api/cli", tags=["cli"])

# Current CLI version - update this when releasing new versions
CURRENT_CLI_VERSION = "v1.4.0"
MINIMUM_CLI_VERSION = "v1.2.0"  # Minimum version required to run


@router.get("/version")
async def get_cli_version():
    """
    Get the latest CLI version information.
    Public endpoint - no authentication required.
    """
    return {
        "current_version": CURRENT_CLI_VERSION,
        "minimum_version": MINIMUM_CLI_VERSION,
        "download_urls": {
            "linux_amd64": "https://www.devhq.site/cli/devhq-v1.4.0-linux-amd64",
            "linux_arm64": "https://www.devhq.site/cli/devhq-v1.4.0-linux-arm64",
            "darwin_amd64": "https://www.devhq.site/cli/devhq-v1.4.0-darwin-amd64",
            "darwin_arm64": "https://www.devhq.site/cli/devhq-v1.4.0-darwin-arm64",
            "windows_amd64": "https://www.devhq.site/cli/devhq-v1.4.0-windows-amd64.exe",
            "windows_arm64": "https://www.devhq.site/cli/devhq-v1.4.0-windows-arm64.exe",
        },
        "release_notes": "Added AI-powered commit message generation with editable suggestions",
    }
