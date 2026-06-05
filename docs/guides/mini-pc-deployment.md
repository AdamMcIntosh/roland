# Roland on a Mini PC — Deployment Gotchas

Reference for running Roland as a headless orchestration node (Intel NUC, Beelink, Raspberry Pi-class x64, etc.).

## Prerequisites

| Requirement | Notes |
|-------------|-------|
| **Node.js ≥ 20** | LTS recommended; ESM-only (`"type": "module"`) |
| **CURSOR_API_KEY** | Required for `roland team`, `roland-orchestrate.mjs`, and SDK paths |
| **Git** | Team runs expect a repo root; state lives in `.roland/` |
| **Network** | Outbound HTTPS to Cursor API; no inbound ports required unless serving dashboard |

## Install

```bash
git clone <repo> && cd roland
npm ci
npm run build
npm link   # optional — global `roland` CLI
```

Verify:

```bash
roland doctor
roland board-status --concise
```

## Environment Variables (mini PC defaults)

```bash
# Conservative concurrency for 8–16 GB RAM / 2–4 cores
export ROLAND_MAX_CONCURRENT=2
export ROLAND_AGENT_TIMEOUT_MS=1500000   # 25 min default
export ROLAND_CIRCUIT_BREAKER=1          # pause on first network error
export ROLAND_SIMPLE_TUI=1               # ASCII TUI over SSH (Termius, etc.)

# Headless / systemd — project root when cwd is not the repo
export ROLAND_PROJECT_ROOT=/home/ops/projects/myapp
export ROLAND_STATE_DIR=/home/ops/projects/myapp/.roland

# Desktop notifications off on headless
unset ROLAND_NOTIFY
```

## SSH / Headless Operation

| Command | Use |
|---------|-----|
| `roland team "goal" --background` | Detached run; check with `roland bg-status` |
| `roland bg-logs --lines 100` | Tail supervisor log |
| `roland status --simple-tui` | Live observer without Unicode box drawing |
| `roland board-status --concise` | UNSC summary without full dump |
| `roland pause` / `roland resume` | HITL from another SSH session |

**Gotcha:** Background mode writes `.roland/supervisor.pid` and logs under `.roland/logs/`. If the process dies uncleanly, remove stale PID file before restarting.

## Dashboard on LAN

```bash
node scripts/serve-dashboard.js --state-dir /path/to/.roland --port 8081
```

Default bind is `127.0.0.1` only. To expose on LAN, put nginx/Caddy in front or change the listen address in `scripts/serve-dashboard.js` (not recommended without auth).

**Gotcha:** Full `/api/board-status` requires `npm run build` — the server imports `dist/rco/board-report.js`. Without build, the API returns a fallback excerpt only.

**Gotcha:** WebSocket push watches `run-state.json`, `command-blackboard.md`, `blackboard.json`. Polling fallback runs every 5 s.

## Windows Mini PC

Same as Linux with these extras:

- Use **PowerShell** or **Git Bash** for `roland` CLI; avoid cmd.exe for quoted goals.
- Path separators: `--state-dir .roland` works; prefer forward slashes in env vars.
- `ROLAND_SIMPLE_TUI=1` helps when SSH clients mangle Unicode.
- Antivirus may lock `.roland/*.json` during writes — exclude `.roland/` from real-time scan if you see corrupt-state warnings.

## Windows: sqlite3 / @cursor/sdk native binding

`roland team`, `roland-orchestrate.mjs`, and any path using `@cursor/sdk` require the **sqlite3** native module (`node_sqlite3.node`). If you see:

```text
Error: Could not locate the bindings file. Tried: ... node_sqlite3.node
```

**Fix (Visual Studio 2022/2026):**

1. Open **Visual Studio Installer** → **Modify** your installation
2. Enable workload **Desktop development with C++** (includes MSVC toolset + Windows SDK)
3. Close terminals/IDEs locking `node_modules`
4. From the Roland repo root:

```powershell
cd D:\projects\roland
npm rebuild sqlite3
```

5. Verify:

```powershell
node -e "import('@cursor/sdk').then(() => console.log('SDK OK'))"
roland doctor
```

If `prebuild-install` fails and rebuild errors with *missing any VC++ toolset*, the C++ workload is not fully installed — the installer must show MSVC v143+ (or current) toolset checked.

**Clean reinstall** (if rebuild keeps failing):

```powershell
cd D:\projects\roland
Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue
npm ci
npm rebuild sqlite3
```

---

## Common Failures

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `CURSOR_API_KEY is not set` | Missing env in systemd/SSH session | Export in unit file or `~/.profile` |
| Circuit breaker / HITL pause | Transient API/network | `roland resume` after connectivity restored |
| Empty command board | First run | Normal — populates after `roland team` or orchestrate |
| `dist/ not found` | Skipped build | `npm run build` |
| Stale `dist/agents/` | YAML edited without rebuild | `npm run build` after agent changes |
| `Cannot find module ... node_sqlite3.node` / sqlite3 bindings | `@cursor/sdk` native addon not built | Install **Desktop development with C++** in Visual Studio Installer, then `npm rebuild sqlite3` from repo root (see below) |
| High RAM use | Too many concurrent agents | `ROLAND_MAX_CONCURRENT=1` |

## systemd Unit (example)

```ini
[Unit]
Description=Roland background team run
After=network-online.target

[Service]
Type=simple
User=ops
WorkingDirectory=/home/ops/projects/myapp
Environment=CURSOR_API_KEY=...
Environment=ROLAND_MAX_CONCURRENT=2
Environment=ROLAND_PROJECT_ROOT=/home/ops/projects/myapp
ExecStart=/usr/bin/node /home/ops/roland/dist/index.js team "%i" --background --no-tui --quiet
Restart=on-failure
RestartSec=30

[Install]
WantedBy=multi-user.target
```

Invoke: `systemctl start 'roland-team@Add rate limiting to API.service'`

## Monitoring Checklist

1. `roland bg-status` — supervisor alive?
2. `roland board-status --concise` — blockers first
3. Dashboard → **Command Board** panel
4. `.roland/usage-history.json` — cost/token trends
5. `.roland/logs/bg-*.log` — agent stderr

## Related

- [Command Blackboard](../evolution/command-blackboard.md)
- [Cursor SDK Orchestration](../evolution/cursor-sdk-orchestration.md)
- [Workflow Stress Tests](../evolution/workflow-stress-tests.md)
