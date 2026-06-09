# Roland on a Mini PC — Deployment Guide

Run Roland as a headless orchestration node on an Intel NUC, Beelink, Raspberry Pi-class x64, home lab VM, or always-on workstation. This guide covers install, conservative defaults, SSH operation, Tailscale access, MCP for remote Cursor clients, and common failure modes.

---

## Prerequisites

| Requirement | Notes |
|-------------|-------|
| **Node.js ≥ 22** | Required by `package.json` engines; LTS recommended |
| **CURSOR_API_KEY** | Required for `roland team`, `roland orchestrate`, and SDK paths |
| **Git** | Team runs expect a repo root; state lives in `.roland/` |
| **Network** | Outbound HTTPS to Cursor API; no inbound ports required unless serving dashboard |
| **gh CLI** (optional) | For `roland pr` GitHub integration |

---

## Install

### Global CLI (recommended)

```bash
git clone https://github.com/AdamMcIntosh/roland.git && cd roland
npm ci
npm run build
npm link              # development — symlinks `roland` onto PATH
# — or —
npm install -g .      # production — copies package into global node_modules
```

From any project directory:

```bash
cd /path/to/myapp
roland doctor
roland board-status --concise
roland board-cleanup --dry-run    # preview stale-task archival
roland team "Test task"
roland orchestrate "SDK supervisor smoke test"
```

### Root resolution

| Root | How it is found |
|------|-----------------|
| **Install** (agents, recipes, `dist/`) | npm package dir via `bin/roland.js` |
| **Project** (`.roland/`, git, blackboard) | Walk up from `cwd` for `.roland/` or `.git/` |

Override when `cwd` is not your repo (systemd, MCP, headless SSH):

```bash
export ROLAND_PROJECT_ROOT=/home/ops/projects/myapp   # primary
export ROLAND_ROOT=/home/ops/projects/myapp           # alias
export ROLAND_STATE_DIR=/home/ops/projects/myapp/.roland
```

Verify:

```bash
which roland
roland --version
roland doctor
```

### MCP shortcut

```bash
npm run mcp          # from Roland repo: node dist/server/mcp-server.js
roland-mcp           # after global install / npm link
roland mcp-config --write
```

Restart Cursor after updating `~/.cursor/mcp.json`.

### Local-only (no global link)

```bash
npm run build
node bin/roland.js doctor
node bin/roland.js board-status --concise
```

---

## Environment variables (mini PC defaults)

```bash
# Conservative concurrency for 8–16 GB RAM / 2–4 cores
export ROLAND_MAX_CONCURRENT=2
export ROLAND_AGENT_TIMEOUT_MS=1500000   # 25 min default
export ROLAND_CIRCUIT_BREAKER=1          # pause on first network error wave
export ROLAND_SIMPLE_TUI=1               # ASCII TUI over SSH (Termius, etc.)

# Headless / systemd — project root when cwd is not the repo
export ROLAND_PROJECT_ROOT=/home/ops/projects/myapp
export ROLAND_STATE_DIR=/home/ops/projects/myapp/.roland

# Desktop notifications off on headless
unset ROLAND_NOTIFY
```

Board hygiene: each `roland team` run auto-archives stale tasks. For manual cleanup between missions:

```bash
roland board-cleanup
roland board-cleanup --dry-run --goal "next mission text"
```

---

## SSH / headless operation

| Command | Use |
|---------|-----|
| `roland team "goal" --background` | Detached run; check with `roland bg-status` |
| `roland bg-logs --lines 100` | Tail supervisor log |
| `roland bg-logs --follow` | Stream live log |
| `roland status --simple-tui` | Live observer without Unicode box drawing |
| `roland board-status --concise` | UNSC summary without full dump |
| `roland board-cleanup --dry-run` | Preview stale board archival |
| `roland pause` / `roland resume` | HITL from another SSH session |
| `roland hitl-status` | Pause/abort queue state |

**Gotcha:** Background mode writes `.roland/supervisor.pid` and logs under `.roland/logs/`. If the process dies uncleanly, remove the stale PID file before restarting.

**Gotcha:** After editing `agents/*.yaml` or `recipes/`, run `npm run build` on the Roland install — `dist/` copies go stale otherwise.

---

## Tailscale access

Use [Tailscale](https://tailscale.com/download) to reach your mini PC's dashboard and SSH from laptops/phones without exposing ports to the public internet.

### 1. Install Tailscale on the mini PC and clients

```bash
# Linux (see tailscale.com/download for your distro)
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
tailscale ip -4    # note the 100.x.y.z address
```

### 2. SSH over Tailscale

```bash
ssh ops@100.x.y.z
export ROLAND_SIMPLE_TUI=1
roland board-status --concise
roland team "goal" --background --no-tui --quiet
```

### 3. Dashboard on the tailnet (including iPhone)

The dashboard is **mobile-first** (`dashboard-ui/styles/mobile-responsive.css`) — touch-friendly controls, collapsible panels, and Safari web-app meta tags for iPhone home-screen pinning.

Default bind is `127.0.0.1`. Options for phone access:

| Approach | Notes |
|----------|-------|
| **Tailscale + bind tailnet** | `node scripts/serve-dashboard.js --host 0.0.0.0 --port 8081` then open `http://100.x.y.z:8081` on iPhone Safari. Safe on a private tailnet; do not expose publicly. |
| **SSH tunnel** | `ssh -L 8081:127.0.0.1:8081 ops@100.x.y.z` then open `http://127.0.0.1:8081` on phone or laptop |
| **Tailscale Serve** | `tailscale serve --bg --https=443 http://127.0.0.1:8081` (HTTPS on tailnet) |

From the dashboard on your phone you can:

- Launch missions with loop templates
- Pause / resume / inject HITL directives
- Connect GitHub and one-click clone repos
- Monitor loop health and exit conditions

For ASCII-only SSH sessions from Termius or Blink, use `roland team "goal" --simple-tui`.

### 4. Cursor MCP with remote project on mini PC

If your repo lives on the mini PC and you edit via SSH remote / synced folder:

```json
{
  "mcpServers": {
    "roland": {
      "command": "node",
      "args": ["/home/ops/roland/dist/server/mcp-server.js"],
      "env": {
        "ROLAND_PROJECT_ROOT": "/home/ops/projects/myapp",
        "ROLAND_QUIET": "1",
        "CURSOR_API_KEY": "…"
      }
    }
  }
}
```

Set `ROLAND_PROJECT_ROOT` explicitly — Cursor's cwd may not be the repo on remote setups.

For Roland Web UI on a home server, see `roland-web/SELF-HOST.md` (separate Tailscale + systemd guide).

---

## Dashboard on LAN

```bash
node scripts/serve-dashboard.js --state-dir /path/to/.roland --port 8081
```

**Gotcha:** Full `/api/board-status` requires `npm run build` — the server imports `dist/rco/board-report.js`. Without build, the API returns a fallback excerpt only.

**Gotcha:** WebSocket push watches `run-state.json`, `command-blackboard.md`, `blackboard.json`. Polling fallback runs every 5 s.

---

## Windows mini PC

Same as Linux with these extras:

- Use **PowerShell** or **Git Bash** for `roland` CLI; avoid cmd.exe for quoted goals.
- Path separators: `--state-dir .roland` works; prefer forward slashes in env vars.
- `ROLAND_SIMPLE_TUI=1` helps when SSH clients mangle Unicode.
- Antivirus may lock `.roland/*.json` during writes — exclude `.roland/` from real-time scan if you see corrupt-state warnings.

### sqlite3 / @cursor/sdk native binding

`roland team`, `roland orchestrate`, and any `@cursor/sdk` path require **sqlite3** (`node_sqlite3.node`). If you see:

```text
Error: Could not locate the bindings file. Tried: ... node_sqlite3.node
```

**Fix (Visual Studio 2022/2026):**

1. Visual Studio Installer → **Desktop development with C++**
2. Close terminals locking `node_modules`
3. From Roland repo root:

```powershell
npm rebuild sqlite3
node -e "import('@cursor/sdk').then(() => console.log('SDK OK'))"
roland doctor
```

---

## Common failures

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `CURSOR_API_KEY is not set` | Missing env in systemd/SSH session | Export in unit file or `~/.profile` |
| Circuit breaker / HITL pause | Transient API/network | `roland resume` after connectivity restored |
| Empty command board | First run | Normal — populates after `roland team` or orchestrate |
| Stale tasks in prompts | Prior mission not cleaned | `roland board-cleanup` (also auto-runs at team start) |
| `dist/ not found` | Skipped build | `npm run build` |
| Stale `dist/agents/` | YAML edited without rebuild | `npm run build` after agent changes |
| sqlite3 bindings missing | Native addon not built | VS C++ workload + `npm rebuild sqlite3` |
| High RAM use | Too many concurrent agents | `ROLAND_MAX_CONCURRENT=1` |
| Garbled TUI over SSH | Unicode / narrow terminal | `ROLAND_SIMPLE_TUI=1` or `--simple-tui` |

---

## systemd unit (example)

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
Environment=ROLAND_STATE_DIR=/home/ops/projects/myapp/.roland
Environment=ROLAND_SIMPLE_TUI=1
ExecStart=/usr/bin/env roland team "%i" --background --no-tui --quiet
Restart=on-failure
RestartSec=30

[Install]
WantedBy=multi-user.target
```

Invoke: `systemctl start 'roland-team@Add rate limiting to API.service'`

For long-running MCP (unusual — Cursor normally spawns MCP locally), prefer interactive `roland team --background` over a persistent MCP systemd unit.

---

## Monitoring checklist

1. `roland bg-status` — supervisor alive?
2. `roland board-status --concise` — blockers first
3. `roland hitl-status` — paused / abort pending?
4. Dashboard → **Command Board** panel
5. `.roland/usage-history.json` — cost/token trends
6. `.roland/logs/bg-*.log` — agent stderr

---

## Roland as a Cursor MCP server

Roland ships a dedicated stdio MCP entry at `dist/server/mcp-server.js`. Cursor spawns it as a child process and communicates over stdin/stdout using MCP JSON-RPC.

### 1. Build Roland

```bash
cd /path/to/roland
npm ci
npm run build
node dist/server/mcp-server.js   # blocks on stdio — Ctrl+C to exit
npm run test:mcp                 # smoke test (8 tool checks)
```

### 2. Add to `~/.cursor/mcp.json`

```bash
roland mcp-config              # print recommended block
roland mcp-config --write      # merge into ~/.cursor/mcp.json
```

Or merge manually (replace paths):

```json
{
  "mcpServers": {
    "roland": {
      "command": "node",
      "args": ["/home/ops/roland/dist/server/mcp-server.js"],
      "env": {
        "ROLAND_PROJECT_ROOT": "/home/ops/projects/myapp",
        "ROLAND_QUIET": "1",
        "CURSOR_API_KEY": "your_key_here"
      },
      "autoApprove": [
        "health_check",
        "roland_hello",
        "board_status",
        "pm_standup",
        "triage",
        "list_team",
        "list_team_recipes",
        "list_recipes",
        "get_team_context",
        "get_pm_playbook",
        "get_team_usage",
        "get_pm_events",
        "get_analytics",
        "suggest_mode",
        "route_model",
        "blackboard_read",
        "bus_poll",
        "git_status",
        "git_diff",
        "git_log",
        "read_context"
      ]
    }
  }
}
```

| Setting | Purpose |
|---------|---------|
| `ROLAND_PROJECT_ROOT` | Project whose `.roland/` state MCP tools read/write |
| `ROLAND_QUIET` | Suppresses info logs on stderr (keeps MCP stdio clean) |
| `CURSOR_API_KEY` | Required for `roland_run_team` |
| `autoApprove` | Read-only tools Cursor can call without prompting |

Restart Cursor after editing `mcp.json`.

### 3. Key MCP tools on a headless node

| Tool | When to use |
|------|-------------|
| `roland_hello` | Session start |
| `triage` | Route goal to Direct vs Team; detect `--force-team` |
| `pm_standup` | Blockers-first board digest |
| `board_status` | End-of-task UNSC summary |
| `roland_run_team` | Background PM run for Team-path goals |
| `git_status` / `git_diff` / `git_log` | Read-only git context |

> There is no `roland triage` CLI command — triage runs via MCP inside Cursor chat.

---

## Related

- [Main README](../../README.md)
- [Evolution architecture](../evolution/README.md)
- [Command Blackboard](../evolution/command-blackboard.md)
- [Cursor SDK orchestration](../evolution/cursor-sdk-orchestration.md)
- [Roland Web self-host](../../roland-web/SELF-HOST.md) — Tailscale + systemd for web UI
