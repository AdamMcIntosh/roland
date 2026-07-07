<#
  install-global.ps1 — Install Roland globally and activate MCP in Cursor.

  Run from the repo root:
    pwsh scripts/install-global.ps1

  What it does:
    1. npm install + build (compiles dist/, copies agents/ + recipes/teams/)
    2. npm install -g . so the `roland` binary is on your PATH
    3. roland init --yes --skip-scaffold  → ~/.roland/.env template + MCP merge
    4. roland doctor --fresh-check        → full install + loop readiness validation

  Then restart Cursor and run: roland init (interactive) to add CURSOR_API_KEY.
#>

$ErrorActionPreference = 'Stop'

function Step($msg) { Write-Host "`n── $msg" -ForegroundColor Cyan }
function Ok($msg)   { Write-Host "  ✓ $msg" -ForegroundColor Green }
function Warn($msg) { Write-Host "  ⚠ $msg" -ForegroundColor Yellow }

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
Set-Location $RepoRoot

Step 'Checking Node.js (requires 22+)'
$nodeMajor = [int](node -p "process.version.slice(1).split('.')[0]")
if ($nodeMajor -lt 22) {
  Write-Error "Node.js 22+ required (found $(node -v)). Install from https://nodejs.org/"
}
Ok "Node $(node -v)"

Step 'Installing dependencies'
npm install
Ok 'dependencies installed'

Step 'Building (dist/ + agents/ + recipes/teams/)'
npm run build
Ok 'build complete'

Step "Installing the 'roland' binary globally"
npm install -g .
Ok 'roland is on your PATH'

Step 'First-run scaffold (~/.roland/.env template)'
try {
  roland init --yes --skip-scaffold --skip-mcp | Out-Null
  Ok 'init scaffold complete'
} catch {
  Warn 'roland init failed — run manually after install'
}

Step 'Activating in Cursor (~/.cursor/mcp.json)'
try {
  roland mcp-config --write
} catch {
  Warn 'mcp-config --write failed — run: roland doctor --fix'
}

Step 'Verifying (roland doctor --fresh-check)'
try {
  roland doctor --fresh-check
  Ok 'all checks passed'
} catch {
  Warn 'some checks failed — run: roland init  then  roland doctor --fix'
}

Write-Host "`nDone. Next:" -ForegroundColor Green
Write-Host '  1. roland init          — add CURSOR_API_KEY interactively'
Write-Host '  2. Restart Cursor'
Write-Host '  3. roland doctor --fresh-check'
Write-Host '  4. roland team "your goal"'
