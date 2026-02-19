# DevHQ CLI Windows Installer

Write-Host "Installing DevHQ CLI for Windows..." -ForegroundColor Cyan

$Version = "1.4.0"
$BinaryUrl = "https://www.devhq.site/cli/devhq-v$Version-windows-amd64.exe"
$InstallDir = "$env:LOCALAPPDATA\devhq"
$BinaryPath = "$InstallDir\devhq.exe"

# Create install directory
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null

# Remove existing binary if it exists (to allow updates)
if (Test-Path $BinaryPath) {
    Write-Host "Removing existing DevHQ CLI..."
    Remove-Item $BinaryPath -Force
}

# Download binary
Write-Host "Downloading DevHQ CLI..."
Invoke-WebRequest -Uri $BinaryUrl -OutFile $BinaryPath

# Add to PATH if not already there
$CurrentPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($CurrentPath -notlike "*$InstallDir*") {
    [Environment]::SetEnvironmentVariable(
        "Path",
        "$CurrentPath;$InstallDir",
        "User"
    )
    Write-Host ""
    Write-Host "`nAdded to PATH. Please restart your terminal." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "✅ DevHQ CLI installed successfully!" -ForegroundColor Green
Write-Host "Run 'devhq --version' to verify installation"
Write-Host ""
Write-Host "Next steps:"
Write-Host "1. Get your API token from https://www.devhq.site/integrations"
Write-Host "2. Configure: devhq config set api-token YOUR_TOKEN"
Write-Host "3. Start tracking: devhq start TRACKING_CODE"
