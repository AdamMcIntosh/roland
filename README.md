# Roland

> **UNSC Smart AI Lead PM** — orchestrates specialist sub-agents to plan, execute, test, and synthesize complex engineering missions.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-22%2B-green.svg)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

> **Current Status:** Phase 2 complete — Sparrow (Coder) hardened + Blackboard hygiene improved.

---

## Quick Start

**Prerequisites:** Node.js 22+, [`CURSOR_API_KEY`](https://cursor.com/settings), a git project directory.

### 1. Global install + basic usage

```bash
git clone https://github.com/AdamMcIntosh/roland.git
cd roland
npm ci && npm run build && npm link

export CURSOR_API_KEY=your_key_here    # add to ~/.bashrc or ~/.zshrc

cd /path/to/your/project
roland doctor
roland board-status --concise
```

Run interactively (default — type goals naturally, `/help` for commands):

```bash
roland
```

Or fire a one-liner:

```bash
roland "add input validation to the registration endpoint"
```

### 2. Your first team mission

From your project repo:

```bash
roland team "add rate limiting to the password reset endpoint"
```

Useful flags for your first run:

```bash
roland team "your goal" --stream          # preview agent output as tasks finish
roland team "your goal" --background      # detach; check with roland bg-status
roland board-status --concise             # battlespace snapshot (blockers first)
```

While a run is active, steer from another terminal:

```bash
roland pause
roland inject "prioritise security over performance"
roland resume
```

### 3. Roland inside Cursor (MCP)

One-time setup after `npm link`:

```bash
roland mcp-config --write    # merges into ~/.cursor/mcp.json
```

Restart Cursor. In chat, mention `@roland` or call `roland_hello`. Roland triages new work automatically:

| In chat | What happens |
|---------|----------------|
| Small fix or question | **Direct** — handled in chat |
| Multi-file feature | **Team** — offers `roland team "…"` |
| `Improve auth --force-team` | **Force team** — launches immediately |

Key MCP tools: `triage` · `roland_run_team` · `pm_standup` · `board_status`

---

## What Roland Does

Roland is a multi-agent platform: **global CLI**, **Cursor MCP server**, and **PM team engine** (Cursor SDK). You state a goal; the Lead PM plans parallel waves, dispatches UNSC callsigns, tracks blockers on the Command Blackboard, and delivers a Mission Complete synthesis.

```
  You ──► Lead PM (grok-4.3) ──► Wave 1 (parallel) ──► Review ──► Synthesis
              │                        │
              ▼                        ▼
     command-blackboard.md      Sparrow · Vanguard · Oracle · Sentinel …
     blackboard.json · memory.md
```

| Layer | Role |
|-------|------|
| **Roland (Lead PM)** | Plan → waves → review → synthesis |
| **UNSC callsigns** | Sparrow, Vanguard, Oracle, Sentinel, Forge, Specter |
| **Command Blackboard** | Live mission picture — `.roland/command-blackboard.md` |
| **Project memory** | Cross-run learning — `.roland/memory.md` |

### Callsign roster

| Callsign | Role | Maps from |
|----------|------|-----------|
| **Sparrow** | Implementation, wiring | `executor*` |
| **Vanguard** | Tests (author → execute) | `test-author`, `test-executor` |
| **Oracle** | Research, architecture | `researcher`, `explore`, `architect` |
| **Sentinel** | Code & security review | `code-reviewer`, `security-reviewer` |
| **Forge** | DevOps, CI, builds | `build-fixer` |
| **Specter** | UI/UX, accessibility | `designer*` |

Sparrow is hardened for pattern adherence, defensive coding, and end-to-end verification (`agents/unsc/sparrow.yaml`).

---

## Direct vs Team

Roland triages every request to **Direct** (chat) or **Team** (full mission). In Cursor, the `triage` MCP tool and project rules enforce this automatically.

| **Direct** — stay in chat | **Team** — spawn `roland team` |
|---------------------------|--------------------------------|
| Comment, typo, rename, one-liner | Multi-step feature or refactor |
| Questions, debugging, research | Multiple files / services |
| Planning only (< ~30 min) | Tests, waves, synthesis (> ~30–45 min) |

**Cursor:** Roland shows `**Execution path:** Direct — …` or offers a team mission before spawning.

**Force full team** (power user — no confirmation in Cursor):

| Trigger | Example |
|---------|---------|
| `--force-team` | `Improve the logger --force-team` |
| `force team` | `force team: refactor auth module` |
| `full team` / `run as team` / `spawn team` | `spawn team to fix the CI pipeline` |

> `triage` is an **MCP tool** in Cursor — there is no `roland triage` CLI command. From the terminal, use `roland board-status --concise`.

---

## Execution modes

| Mode | When | Command |
|------|------|---------|
| **Direct** | Quick chat work | Cursor tools in chat |
| **Team** | Full PM mission | `roland team "goal"` or `roland_run_team` |
| **Orchestrate** | SDK supervisor + inline sub-agents | `roland orchestrate "goal"` |
| **Chat CLI** | Interactive terminal session | `roland` or `roland chat` |

All modes share `.roland/` state, memory, and the Command Blackboard.

---

## CLI reference

### Missions

| Command | Purpose |
|---------|---------|
| `roland "goal"` | Shortcut for `roland team` |
| `roland team "goal"` | PM team with live TUI |
| `roland team "goal" --stream` | Agent output preview per task |
| `roland team "goal" --background` | Detached run |
| `roland team "goal" --simple-tui` | ASCII-only (SSH / Termius) |
| `roland orchestrate "goal"` | SDK supervisor mode |
| `roland chat` | Interactive session |

### Battlespace & hygiene

| Command | Purpose |
|---------|---------|
| `roland board-status` | UNSC mission summary |
| `roland board-status --concise` | One-screen digest |
| `roland board-cleanup` | Archive stale tasks |
| `roland board-cleanup --dry-run` | Preview cleanup |
| `roland pm-log` | PM event timeline |

Board cleanup runs automatically at each team mission start.

### Human-in-the-loop

| Command | Purpose |
|---------|---------|
| `roland pause` / `roland resume` | Pause / resume between waves |
| `roland abort` | Stop after current wave |
| `roland inject "…"` | Directive to Lead PM |
| `roland unblock task-3 "…"` | Unblock a stalled agent |
| `roland replan` | Ask PM to re-evaluate plan |
| `roland hitl-status` | Queue and pause state |

Also available as `/pause`, `/resume`, … in chat and on the web dashboard.

### Background, GitHub, utilities

```bash
roland team "goal" --background && roland bg-status && roland bg-logs --follow
roland pr 42 --fix                     # review + fix via gh CLI
roland watch --pattern "src/**"        # auto-run on file changes
roland doctor                          # verify install
roland mcp-config [--write]            # Cursor MCP entry
roland --help                          # full reference
```

Team runs use `roland/<slug>` branches; Sentinel gates before merge.

### Environment variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `CURSOR_API_KEY` | *(required)* | Agent execution |
| `ROLAND_PROJECT_ROOT` | auto-detect | Project when cwd ≠ repo |
| `ROLAND_STATE_DIR` | `.roland` | Persistence directory |
| `ROLAND_MAX_CONCURRENT` | `2` | Parallel agents per wave |
| `ROLAND_AGENT_TIMEOUT_MS` | `1500000` | 25 min per agent |
| `ROLAND_CIRCUIT_BREAKER` | `1` | Pause after network errors |
| `ROLAND_SIMPLE_TUI` | `0` | ASCII-only output |
| `ROLAND_NOTIFY` | `0` | Desktop notifications |

Headless / mini PC / Tailscale: [docs/guides/mini-pc-deployment.md](docs/guides/mini-pc-deployment.md)

---

## Cursor MCP

After `roland mcp-config --write` and a Cursor restart:

| Tool | When |
|------|------|
| `roland_hello` | Session start |
| `triage` | **First on new work** — Direct vs Team, agent, recipe |
| `roland_run_team` | Background PM team (Team path or force-team) |
| `pm_standup` | Blockers-first board digest |
| `board_status` | End-of-task UNSC summary |
| `start_team_recipe` | `full-feature-team` · `bugfix-team` · `refactor-team` |
| `unblock_task` | Resolve blockers with a decision |
| `git_status` / `git_diff` / `git_log` | Read-only git context |

Mutating tools require approval in Cursor. Read-only tools can go in `autoApprove` — see `roland mcp-config`.

**Rules behavior:** Direct → implement in chat. Team → offer mission first. Force-team → launch `roland_run_team` immediately.

Manual PM mode (you dispatch engineers in separate panes): [docs/guides/pm-workflow.md](docs/guides/pm-workflow.md)

---

## Architecture

**PM loop:** Plan → parallel waves → review/adjust → synthesis → memory + blackboard update.

| Lane | Model | Roles |
|------|-------|-------|
| PM | `grok-4.3` | Lead PM |
| Reasoning | `claude-sonnet-4-6` | architect, critic, analyst, … |
| Execution | `composer-2.5` | Sparrow, Vanguard execute, build-fixer, … |

**`.roland/` state:**

| File | Purpose |
|------|---------|
| `command-blackboard.md` | Human-readable battlespace |
| `blackboard.json` | Tasks, blockers, decisions |
| `memory.md` | Cross-run knowledge |
| `run-state.json` | Live progress |
| `usage-history.json` | Token/cost estimates |

Deep dive: [docs/evolution/README.md](docs/evolution/README.md) · developer guide: [CLAUDE.md](CLAUDE.md)

---

## Web dashboard

```bash
npm run serve-dashboard
# → http://127.0.0.1:8081
```

Live progress, HITL controls, run history, memory editor, Command Board panel.

---

## Resilience

| Setting | Default |
|---------|---------|
| Max concurrent agents | 2 |
| Retries | 4 (5 total attempts) |
| Circuit breaker | 1 network-error wave → HITL pause |
| Retry jitter | ±30% on backoff |
| Warmup stagger | 1500 ms between slot starts |

Failed agents return a synthetic **BLOCKER** — the PM re-scopes instead of crashing the run.

---

## Install options

| Method | Command |
|--------|---------|
| Dev link | `npm ci && npm run build && npm link` |
| Global install | `npm install -g .` |
| One-command setup | See [INSTALLATION.md](INSTALLATION.md) |
| MCP only | `roland-mcp` or `npm run mcp` |

After changes to `src/` or agent YAML: `npm run build`. Verify with `roland doctor`.

---

## Documentation

| Doc | Contents |
|-----|----------|
| [DAILY-USAGE.md](DAILY-USAGE.md) | Chat workflows, controls, troubleshooting |
| [INSTALLATION.md](INSTALLATION.md) | MCP setup for Cursor / VS Code |
| [docs/evolution/README.md](docs/evolution/README.md) | UNSC architecture and capabilities |
| [docs/guides/mini-pc-deployment.md](docs/guides/mini-pc-deployment.md) | Headless, Tailscale, systemd |
| [docs/guides/pm-workflow.md](docs/guides/pm-workflow.md) | Manual PM mode in Cursor |
| [CLAUDE.md](CLAUDE.md) | Developer conventions and smoke tests |
| [CHANGELOG.md](CHANGELOG.md) | Version history |

---

## Development

```bash
npm run build && npm run test:run
node scripts/test-routing.mjs           # 8/8
node scripts/test-signals.mjs           # 8/8
node scripts/test-mcp-tools.mjs         # 8/8
node scripts/test-retry-resilience.mjs  # 70/70
```

---

## License

MIT © Adam McIntosh
