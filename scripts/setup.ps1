#Requires -Version 5.1
<#
.SYNOPSIS
    One-command setup for Roland Code Orchestrator (Windows PowerShell)

.DESCRIPTION
    Checks environment, installs Goose if needed, prompts for OpenRouter API key,
    clones/builds Roland, configures Goose globally, and initialises the current project.

.EXAMPLE
    # Remote one-liner:
    irm https://raw.githubusercontent.com/AdamMcIntosh/roland/main/scripts/setup.ps1 | iex

    # Or run locally:
    .\scripts\setup.ps1
#>

$ErrorActionPreference = "Stop"

$Version     = "0.1.5"
$RolandRepo  = "https://github.com/AdamMcIntosh/roland.git"
$RolandDir   = Join-Path $env:USERPROFILE ".roland\roland"
$RolandConfig = Join-Path $env:USERPROFILE ".roland\config.yaml"

# ── Helpers ──────────────────────────────────────────────────────────────────

function Write-Ok($msg)   { Write-Host "  ✓ $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "  ! $msg" -ForegroundColor Yellow }
function Write-Err($msg)  { Write-Host "  ✗ $msg" -ForegroundColor Red }
function Write-Step($msg) { Write-Host "`n── $msg" -ForegroundColor Cyan }

function Confirm-Prompt {
    param([string]$Message, [string]$Default = "y")
    $suffix = if ($Default -eq "y") { "[Y/n]" } else { "[y/N]" }
    $ans = Read-Host "  $Message $suffix"
    if ([string]::IsNullOrWhiteSpace($ans)) { $ans = $Default }
    return $ans -match '^[Yy]'
}

# ── Banner ───────────────────────────────────────────────────────────────────

Write-Host ""
Write-Host "╔═══════════════════════════════════════╗" -ForegroundColor Magenta
Write-Host "║        Roland Setup  v$Version           ║" -ForegroundColor Magenta
Write-Host "║  One-command Roland Code Orchestrator  ║" -ForegroundColor Magenta
Write-Host "╚═══════════════════════════════════════╝" -ForegroundColor Magenta
Write-Host ""

# ── Node.js check ────────────────────────────────────────────────────────────

Write-Step "Checking environment"

$nodePath = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodePath) {
    Write-Err "Node.js is not installed."
    Write-Host "  Download it from https://nodejs.org/ (v18+ required)"
    exit 1
}

$nodeMajor = [int](node -e "process.stdout.write(String(process.versions.node.split('.')[0]))")
if ($nodeMajor -lt 18) {
    Write-Err "Node.js >= 18 is required. You have v$(node -v)."
    Write-Host "  Download the latest LTS at https://nodejs.org/"
    exit 1
}
Write-Ok "Node.js $(node -v)"

$gitPath = Get-Command git -ErrorAction SilentlyContinue
if (-not $gitPath) {
    Write-Err "Git is not installed."
    exit 1
}
Write-Ok "Git $(git --version)"

# ── Goose install/check ─────────────────────────────────────────────────────

Write-Step "Checking for Goose"

$HaveGoose = $false
$goosePath = Get-Command goose -ErrorAction SilentlyContinue

if ($goosePath) {
    Write-Ok "Goose found ($($goosePath.Source))"
    $HaveGoose = $true
} else {
    Write-Warn "Goose not found."
    if (Confirm-Prompt "Install Goose now?") {
        Write-Host "  Installing Goose..." -ForegroundColor Cyan
        $tmpScript = Join-Path $env:TEMP "goose_download_cli.ps1"
        try {
            Invoke-WebRequest -Uri "https://raw.githubusercontent.com/block/goose/main/download_cli.ps1" -OutFile $tmpScript
            & $tmpScript
            Remove-Item $tmpScript -ErrorAction SilentlyContinue

            # Refresh PATH
            $env:PATH = [System.Environment]::GetEnvironmentVariable("PATH", "User") + ";" + [System.Environment]::GetEnvironmentVariable("PATH", "Machine")

            $goosePath = Get-Command goose -ErrorAction SilentlyContinue
            if ($goosePath) {
                Write-Ok "Goose installed successfully"
                $HaveGoose = $true
            } else {
                Write-Warn "Goose installed but not found in PATH. Restart your terminal after setup."
            }
        } catch {
            Write-Err "Goose install failed: $_"
            Write-Warn "You can install manually from https://block.github.io/goose/"
        }
    } else {
        Write-Warn "Skipping Goose. Install later from https://block.github.io/goose/"
    }
}

# ── OpenRouter API key ───────────────────────────────────────────────────────

Write-Step "OpenRouter API Key"
Write-Host "  Roland uses OpenRouter for model routing. Get a key at https://openrouter.ai/" -ForegroundColor Cyan

$ApiKey = ""
$Attempts = 0

while ($Attempts -lt 3) {
    if ($Attempts -eq 0) {
        $key = Read-Host "  Enter your OpenRouter API key (or press Enter to skip)"
    } else {
        $key = Read-Host "  Try again (or press Enter to skip)"
    }

    if ([string]::IsNullOrWhiteSpace($key)) {
        Write-Warn "No API key provided — skipping. Roland will not route models via OpenRouter."
        break
    }

    Write-Host "  Validating key..."
    try {
        $response = Invoke-WebRequest -Uri "https://openrouter.ai/api/v1/models" `
            -Headers @{ "Authorization" = "Bearer $key"; "HTTP-Referer" = "https://github.com/AdamMcIntosh/roland" } `
            -Method Get -UseBasicParsing -ErrorAction Stop
        if ($response.StatusCode -eq 200) {
            Write-Ok "API key validated"
            $ApiKey = $key
            break
        }
    } catch {
        Write-Err "Key appears invalid. Check the key and try again."
        $Attempts++
    }
}

if ($Attempts -ge 3 -and [string]::IsNullOrWhiteSpace($ApiKey)) {
    if (-not (Confirm-Prompt "Continue without a valid API key?")) {
        Write-Host "  Setup cancelled."
        exit 0
    }
    Write-Warn "Continuing without API key."
}

# ── Clone or update Roland ───────────────────────────────────────────────────

Write-Step "Roland Installation"

$rolandParent = Join-Path $env:USERPROFILE ".roland"
if (-not (Test-Path $rolandParent)) {
    New-Item -ItemType Directory -Path $rolandParent -Force | Out-Null
}

if (Test-Path (Join-Path $RolandDir ".git")) {
    Write-Host "  Updating existing clone at $RolandDir"
    try {
        git -C $RolandDir pull --ff-only
        Write-Ok "Roland updated"
    } catch {
        Write-Warn "git pull failed — continuing with existing clone."
    }
} else {
    Write-Host "  Cloning Roland into $RolandDir"
    try {
        git clone $RolandRepo $RolandDir
        Write-Ok "Roland cloned"
    } catch {
        Write-Err "Clone failed: $_"
        if (-not (Confirm-Prompt "Continue anyway?" "n")) { exit 1 }
    }
}

# ── Build Roland ─────────────────────────────────────────────────────────────

Write-Step "Building Roland"

Write-Host "  Running npm install..."
try {
    Push-Location $RolandDir
    npm install
    Write-Ok "npm install complete"
} catch {
    Write-Err "npm install failed: $_"
    if (-not (Confirm-Prompt "Continue anyway?" "n")) { exit 1 }
} finally {
    Pop-Location
}

Write-Host "  Running npm run build..."
try {
    Push-Location $RolandDir
    npm run build
    Write-Ok "Build complete"
} catch {
    Write-Err "Build failed: $_"
    if (-not (Confirm-Prompt "Continue anyway?" "n")) { exit 1 }
} finally {
    Pop-Location
}

# ── Configure Goose globally ────────────────────────────────────────────────

if ($HaveGoose) {
    Write-Step "Configuring Goose"

    # Detect config path via goose info
    $GooseConfig = ""
    try {
        $info = goose info 2>&1 | Out-String
        if ($info -match 'Config yaml:\s*(.+)') {
            $GooseConfig = $Matches[1].Trim()
        }
    } catch {}

    # Fallback
    if ([string]::IsNullOrWhiteSpace($GooseConfig)) {
        $GooseConfig = Join-Path $env:APPDATA "Block\goose\config\config.yaml"
    }

    $GooseConfigDir = Split-Path $GooseConfig -Parent
    $RolandDist = (Join-Path $RolandDir "dist\index.js") -replace '\\', '/'

    Write-Host "  Goose config: $GooseConfig"

    if (-not (Test-Path $GooseConfigDir)) {
        New-Item -ItemType Directory -Path $GooseConfigDir -Force | Out-Null
    }

    if (Test-Path $GooseConfig) {
        $content = Get-Content $GooseConfig -Raw

        # Add Roland extension if not present
        if ($content -match "roland:") {
            Write-Ok "Goose config already has Roland — skipping"
        } else {
            $rolandBlock = @"
  roland:
    name: Roland
    type: stdio
    cmd: node
    args:
      - "$RolandDist"
    enabled: true
    timeout: 300
"@
            # Insert inside the extensions block, before GOOSE_PROVIDER line
            if ($content -match '(?m)^GOOSE_PROVIDER:') {
                $content = $content -replace '(?m)^GOOSE_PROVIDER:', "$rolandBlock`nGOOSE_PROVIDER:"
                Set-Content -Path $GooseConfig -Value $content -NoNewline
            } elseif ($content -match '(?m)^extensions:') {
                # Append after extensions block (end of file)
                Add-Content -Path $GooseConfig -Value "`n$rolandBlock"
            } else {
                # No extensions block — add one
                Add-Content -Path $GooseConfig -Value "`nextensions:`n$rolandBlock"
            }
            Write-Ok "Added Roland extension to existing Goose config"
        }

        # Offer to switch model
        if ($content -match 'GOOSE_MODEL:\s*(.+)') {
            $currentModel = $Matches[1].Trim()
            Write-Host "  Current model: $currentModel"
            if (Confirm-Prompt "Switch to anthropic/claude-haiku-4.5 (recommended)?") {
                $content = $content -replace 'GOOSE_MODEL:.*', 'GOOSE_MODEL: anthropic/claude-haiku-4.5'
                Set-Content -Path $GooseConfig -Value $content -NoNewline
                Write-Ok "Model set to anthropic/claude-haiku-4.5"
            }
        }
    } else {
        # Write fresh config
        $apiKeyLine = if ($ApiKey) { "OPENROUTER_API_KEY: $ApiKey" } else { "# OPENROUTER_API_KEY: sk-or-..." }
        $freshConfig = @"
# Goose global config — auto-generated by Roland setup
# Edit or re-run 'goose configure' to change provider/model settings.

GOOSE_PROVIDER: openrouter
GOOSE_MODEL: anthropic/claude-haiku-4.5
$apiKeyLine

extensions:
  developer:
    name: Developer
    type: builtin
    enabled: true

  roland:
    name: Roland
    type: stdio
    cmd: node
    args:
      - "$RolandDist"
    enabled: true
    timeout: 300
"@
        Set-Content -Path $GooseConfig -Value $freshConfig
        Write-Ok "Goose config written to $GooseConfig"
    }
}

# ── Init current project ────────────────────────────────────────────────────

Write-Step "Initialising current project"

$TargetDir = if ($args.Count -gt 0) { $args[0] } else { Get-Location }
Write-Host "  Target: $TargetDir"

try {
    Push-Location $RolandDir
    npm run init -- "$TargetDir"
    Write-Ok "Project initialised"
} catch {
    Write-Err "Init failed: $_"
    if (-not (Confirm-Prompt "Continue anyway?")) { exit 1 }
} finally {
    Pop-Location
}

# ── Save Roland config ───────────────────────────────────────────────────────

if ($ApiKey) {
    Write-Step "Saving configuration"

    $rolandConfigDir = Split-Path $RolandConfig -Parent
    if (-not (Test-Path $rolandConfigDir)) {
        New-Item -ItemType Directory -Path $rolandConfigDir -Force | Out-Null
    }

    if (Test-Path $RolandConfig) {
        $content = Get-Content $RolandConfig -Raw
        if ($content -match "openrouter_api_key:") {
            $content = $content -replace 'openrouter_api_key:.*', "openrouter_api_key: `"$ApiKey`""
        } elseif ($content -match "^goose:") {
            $content = $content -replace '(^goose:)', "`$1`n  openrouter_api_key: `"$ApiKey`""
        } else {
            $content += "`ngoose:`n  openrouter_api_key: `"$ApiKey`"`n"
        }
        Set-Content -Path $RolandConfig -Value $content -NoNewline
    } else {
        $yamlContent = @"
# Roland configuration
# Auto-generated by roland setup

goose:
  openrouter_api_key: "$ApiKey"
"@
        Set-Content -Path $RolandConfig -Value $yamlContent
    }
    Write-Ok "Config saved to $RolandConfig"
}

# ── Summary ──────────────────────────────────────────────────────────────────

Write-Host ""
Write-Host "═══════════════════════════════════════" -ForegroundColor Green
Write-Host "  Roland setup complete!" -ForegroundColor Green
Write-Host "═══════════════════════════════════════" -ForegroundColor Green
Write-Host ""
Write-Host "What was set up:" -NoNewline
Write-Host ""
Write-Host "  • Roland cloned/updated at " -NoNewline; Write-Host $RolandDir -ForegroundColor Cyan
Write-Host "  • Current project initialised with agent configs and MCP settings"
if ($ApiKey) {
    Write-Host "  • OpenRouter API key saved to " -NoNewline; Write-Host $RolandConfig -ForegroundColor Cyan
}
if ($HaveGoose) {
    Write-Host "  • Goose configured with Roland extension"
}
Write-Host ""
Write-Host "Next steps:" -ForegroundColor White
Write-Host "  1. Open this project in Cursor or VS Code"
Write-Host "  2. Verify: ask your IDE agent to `"Use the health_check tool`""
Write-Host "     You should get: " -NoNewline; Write-Host "status: healthy" -ForegroundColor Green
Write-Host "  3. Start a Goose session:"
Write-Host "     goose session" -ForegroundColor Cyan
Write-Host "  4. Try a recipe:"
Write-Host "     goose run --recipe ~/.roland/roland/goose/recipes/roland-plan-exec-rev-ex.yaml --task `"...`"" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Docs: https://github.com/AdamMcIntosh/roland"
Write-Host ""
