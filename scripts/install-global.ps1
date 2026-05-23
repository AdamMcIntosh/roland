<#
  install-global.ps1 — Install Roland globally and activate the PM Team in Cursor.

  Run from the repo root:
    pwsh scripts/install-global.ps1

  What it does:
    1. npm install + build (compiles dist/, copies agents/ + recipes/teams/)
    2. npm install -g . so the `roland` binary is on your PATH
    3. roland mcp-config --write  → merges the "roland" server into ~/.cursor/mcp.json
    4. roland doctor              → verifies the install

  Then restart Cursor. Roland's PM tools become available in every project.
#>

$ErrorActionPreference = 'Stop'

function Step($msg) { Write-Host "`n── $msg" -ForegroundColor Cyan }
function Ok($msg)   { Write-Host "  ✓ $msg" -ForegroundColor Green }

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
Set-Location $RepoRoot

Step 'Installing dependencies'
npm install
Ok 'dependencies installed'

Step 'Building (dist/ + agents/ + recipes/teams/)'
npm run build
Ok 'build complete'

Step "Installing the 'roland' binary globally"
npm install -g .
Ok 'roland is on your PATH'

Step 'Activating in Cursor (~/.cursor/mcp.json)'
roland mcp-config --write

Step 'Verifying'
try { roland doctor } catch { }

Write-Host "`nDone. Restart Cursor, then call get_pm_playbook to start PM-ing." -ForegroundColor Green
