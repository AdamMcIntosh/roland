# RCO Phase 4 — PowerShell installer (Windows).
# Usage: irm https://raw.githubusercontent.com/OWNER/roland/main/install.ps1 | iex
# Or: .\install.ps1 -InstallDir "C:\opt\rco"
# Default install dir: ~\.local\share\roland (or $env:RCO_INSTALL_DIR)

param(
  [string]$InstallDir
)

$ErrorActionPreference = 'Stop'

$RcoVersion   = if ($env:RCO_VERSION)   { $env:RCO_VERSION }   else { '0.1.0' }
$GitHubRepo   = if ($env:GITHUB_REPO)   { $env:GITHUB_REPO }   else { 'AdamMcIntosh/roland' }
$DefaultDir   = Join-Path $env:USERPROFILE '.local\share\roland'
$InstallDir   = if ($InstallDir)         { $InstallDir }
                elseif ($env:RCO_INSTALL_DIR) { $env:RCO_INSTALL_DIR }
                else { $DefaultDir }

$ZipUrl = "https://github.com/$GitHubRepo/releases/download/v$RcoVersion/roland-plugin-$RcoVersion.zip"
$ZipPath = Join-Path $InstallDir 'roland-plugin.zip'

function Log($msg) { Write-Host "[RCO install] $msg" }

Log "Install directory: $InstallDir"
Log "Downloading v$RcoVersion from GitHub..."

New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null

try {
  Invoke-WebRequest -Uri $ZipUrl -OutFile $ZipPath -UseBasicParsing
} catch {
  Log "Download failed. If the release is not published yet, build locally: npm run build-plugin-zip"
  exit 1
}

Log 'Extracting...'
Expand-Archive -Path $ZipPath -DestinationPath $InstallDir -Force
Remove-Item $ZipPath -Force -ErrorAction SilentlyContinue

if (Test-Path (Join-Path $InstallDir 'plugin.js')) {
  Log "Plugin extracted to $InstallDir\plugin.js"
}

Log 'Done. To use globally, add the install directory to your PATH.'
