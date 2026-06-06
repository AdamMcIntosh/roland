# Roland

> **UNSC Smart AI Lead PM** — orchestrates specialist sub-agents to plan, execute, test, and synthesize complex engineering missions.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-22%2B-green.svg)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Roland is a multi-agent orchestration platform delivered as a **global CLI**, **MCP server for Cursor**, and **PM team execution engine** driven by the Cursor SDK. You describe a goal; Roland's Lead PM decomposes it into parallel waves, dispatches callsign specialists (Sparrow, Vanguard, Oracle, Sentinel, …), tracks blockers on a Command Blackboard, and delivers a Mission Complete synthesis.

```
  You ──► Lead PM (grok-4.3) ──► Wave 1 (parallel) ──► Review ──► Wave 2 ──► Synthesis
              │                        │
              ▼                        ▼
     command-blackboard.md      Sparrow · Vanguard · Oracle · Sentinel …
     blackboard.json · memory.md
```

---

## Quick start

**Prerequisites:** Node.js 22+, `CURSOR_API_KEY`, a git project directory.

```bash
git clone https://github.com/AdamMcIntosh/roland.git && cd roland
npm ci && npm run build && npm link

export CURSOR_API_KEY=your_key_here   # add to ~/.bashrc or ~/.zshrc

cd /path/to/your/project
roland doctor
roland "add input validation to the registration endpoint"
```

Interactive chat (default when you run `roland` with no args):

```bash
roland          # type goals naturally; /help for slash commands
```

Cursor MCP (one-time):

```bash
roland mcp-config --write   # merge into ~/.cursor/mcp.json — restart Cursor
```

---

## What Roland is

| Layer | Role |
|-------|------|
| **Roland (Lead PM)** | Plans tasks, runs waves, reviews output, resolves blockers, writes synthesis |
| **UNSC callsigns** | Named specialists mapped from legacy agent personas |
| **Command Blackboard** | Live mission picture — `.roland/command-blackboard.md` + `blackboard.json` |
| **Project memory** | Cross-run learning — `.roland/memory.md` with smart recall into prompts |

### Callsign roster

| Callsign | Role | Legacy agents |
|----------|------|---------------|
| **Sparrow** | Implementation, wiring | `executor*` |
| **Vanguard** | Tests (author → execute) | `test-author`, `test-executor` |
| **Oracle** | Research, architecture | `researcher`, `explore`, `architect` |
| **Sentinel** | Code & security review | `code-reviewer`, `security-reviewer` |
| **Forge** | DevOps, CI, builds | `build-fixer` |
| **Specter** | UI/UX, accessibility | `designer*` |

Sparrow is hardened for pattern adherence, defensive coding, structured logging, and end-to-end verification — see `agents/unsc/sparrow.yaml`.

---

## Three ways to run work

| Mode | When | How |
|------|------|-----|
| **Direct (Cursor chat)** | Single-file edits, Q&A, quick fixes (< ~30 min) | Handle in chat with Cursor tools — no team spawn |
| **Team (`roland team`)** | Multi-file features, tests, synthesis, blockers | CLI or `roland_run_team` MCP tool |
| **Orchestrate (`roland orchestrate`)** | SDK supervisor with inline UNSC sub-agents | `roland orchestrate "mission goal"` |

All three share the same `.roland/` state directory, memory, and Command Blackboard.

---

## Direct vs full team — decision guide

Roland triages every new request to **Direct** or **Team**. In Cursor, the `triage` MCP tool (and `.cursor/rules/roland.mdc`) enforce this automatically.

| Choose **Direct** | Choose **Team** |
|-------------------|-----------------|
| Comment, typo, rename, one-liner | Multi-step feature or refactor |
| Questions, debugging help, research | Multiple files / services |
| Planning discussion (no implementation yet) | Needs tests, blackboard waves, synthesis |
| Estimated < 30 minutes | Estimated > 30–45 minutes |
| No Sparrow + Vanguard orchestration | Benefits from parallel callsigns + Sentinel gate |

**In Cursor chat:** Roland shows `**Execution path:** Direct — …` or offers `roland team "…"` before spawning.

**Force full team (power user)** — bypass scoring, launch immediately:

| Trigger | Example |
|---------|---------|
| `--force-team` | `Improve the logger --force-team` |
| `force team` | `force team: refactor auth module` |
| `full team` | `Just do the full team run: add rate limiting` |
| `run as team` | `run as team on the payments module` |
| `spawn team` | `spawn team to fix the CI pipeline` |

In Cursor, force-team triggers call `roland_run_team` with no confirmation. On CLI, append the trigger to your goal string.

> **Note:** `triage` is an **MCP tool** used inside Cursor — there is no `roland triage` CLI subcommand. Use `roland board-status --concise` from the terminal for battlespace snapshots.

---

## CLI reference

### Run missions

```bash
roland "goal"                         # shortcut for roland team
roland team "goal"                    # PM team with live TUI
roland team "goal" --stream           # preview agent output per task
roland team "goal" --background       # detached; roland bg-status / bg-logs
roland team "goal" --no-improve       # skip self-improvement retrospective
roland team "goal" --simple-tui       # ASCII-only (SSH / Termius)
roland orchestrate "mission goal"     # SDK supervisor + UNSC sub-agents
roland chat                           # interactive session (also default `roland`)
```

### Battlespace & hygiene

```bash
roland board-status                   # UNSC mission summary
roland board-status --concise         # chat-friendly one-screen digest
roland board-status --json            # machine-readable
roland board-cleanup                  # archive stale tasks before a new mission
roland board-cleanup --dry-run        # preview cleanup actions
roland pm-log                         # PM event timeline
```

Board cleanup runs automatically at the start of each `roland team` mission — stale `[done]` / `[pending]` tasks from prior runs are archived so planning prompts stay clean.

### Human-in-the-loop (while a run is active)

```bash
roland pause
roland resume
roland abort
roland inject "prioritise security over perf"
roland unblock task-3 "use REST not gRPC"
roland replan
roland hitl-status
```

Also available as slash commands inside chat (`/pause`, `/resume`, …) and on the web dashboard.

### Background supervisor

```bash
roland team "goal" --background
roland bg-status [--json]
roland bg-logs [--lines 100] [--follow]
roland bg-stop
```

Logs: `.roland/logs/bg-<timestamp>.log`

### GitHub & automation

```bash
roland pr 42                          # review PR via gh CLI
roland pr 42 --fix                    # review + implement fixes + commit
roland watch                          # auto-run on git commits
roland watch --pattern "src/**"       # file-change trigger
```

Team runs preserve the `roland/<slug>` branch workflow; sub-agents commit to the active mission branch. Sentinel gates quality before merge.

### Utilities

```bash
roland doctor                         # install + build + MCP + sqlite3 checks
roland mcp-config [--write]           # print or merge Cursor MCP entry
roland serve                          # stdio MCP server
roland status                         # live TUI observer for active run
roland --help                         # full command reference
```

### Key environment variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `CURSOR_API_KEY` | *(required)* | Agent execution |
| `ROLAND_PROJECT_ROOT` | auto-detect | Project when cwd is not the repo |
| `ROLAND_STATE_DIR` | `.roland` | Persistence directory |
| `ROLAND_MAX_CONCURRENT` | `2` | Parallel agents per wave |
| `ROLAND_AGENT_TIMEOUT_MS` | `1500000` (25 min) | Per-agent wall clock |
| `ROLAND_CIRCUIT_BREAKER` | `1` | Pause after N network error waves |
| `ROLAND_SIMPLE_TUI` | `0` | ASCII-only output |
| `ROLAND_NOTIFY` | `0` | Desktop notifications globally |

See [mini PC deployment](docs/guides/mini-pc-deployment.md) for headless, Tailscale, and systemd patterns.

---

## Using Roland in Cursor

### Setup

1. `npm link` or `npm install -g .` from the Roland repo
2. `roland mcp-config --write`
3. Restart Cursor
4. Ensure `.cursor/rules/roland.mdc` is active (ships with Roland exports)

### MCP tools (47 total)

| Tool | When |
|------|------|
| `roland_hello` | Session start |
| `triage` | **First on new work** — agent, recipe, Direct vs Team, force-team detection |
| `roland_run_team` | Launch background PM team (Team path or force-team) |
| `pm_standup` | Blockers-first board digest each turn |
| `board_status` | End-of-task UNSC summary |
| `get_team_context` | Full structured board |
| `start_team_recipe` | `full-feature-team` · `bugfix-team` · `refactor-team` |
| `unblock_task` | Resolve blockers with a concrete decision |
| `blackboard_read` / `blackboard_post` | Read/write coordination state |
| `git_status` / `git_diff` / `git_log` | Read-only git context |

Mutating tools (`roland_run_team`, `git_commit`, `spawn_task`, …) require approval in Cursor. Read-only tools can be listed in `autoApprove` — see `roland mcp-config`.

### Cursor rules behavior

- **Direct path:** Roland handles work in chat with Cursor tools — fast, low overhead.
- **Team path:** Roland offers `roland team "…"` and waits for confirmation — does not implement multi-file work inline.
- **Force-team:** Launches `roland_run_team` immediately with cleaned goal text.

Manual PM workflow (you as Lead PM dispatching engineers in separate panes): see [PM workflow guide](docs/guides/pm-workflow.md).

---

## Architecture (summary)

```
src/
  index.ts              CLI dispatcher (team, board-status, orchestrate, HITL, …)
  rco/
    team-orchestrator.ts   PM loop: plan → waves → review → synthesis
    command-blackboard.ts  UNSC markdown battlespace
    board-cleanup.ts         Stale task archival at mission start
    execution-path.ts        Direct vs Team triage + force-team triggers
    pm-prompts.ts            Lead PM planning / review / synthesis prompts
    worker-signals.ts        BLOCKER / MESSAGE parsing from agent output
  server/mcp-server.ts    47 MCP tools for Cursor / VS Code
agents/                   45+ YAML personas + agents/unsc/ callsigns
recipes/teams/            full-feature-team, bugfix-team, refactor-team
```

### PM team loop

1. **Planning** — Lead PM reads goal, project knowledge, memory, Command Blackboard snapshot
2. **Waves** — tasks with satisfied `dependsOn` run in parallel (concurrency cap: 2 default)
3. **Review** — PM decides `continue` or `adjust` (spawn tasks, unblock, re-scope)
4. **Synthesis** — executive summary, memory extract, Command Blackboard update, optional retrospective

### State files (`.roland/`)

| File | Purpose |
|------|---------|
| `command-blackboard.md` | Human-readable UNSC battlespace |
| `blackboard.json` | Machine-readable tasks, blockers, decisions |
| `memory.md` | Cross-run architecture decisions, gotchas, preferences |
| `messages.json` | Inter-agent message bus |
| `run-state.json` | Live job progress (dashboard + `roland status`) |
| `usage-history.json` | Token/cost estimates per run |
| `hitl.json` | Human-in-the-loop command queue |

### Model routing

| Lane | Model | Roles |
|------|-------|-------|
| PM | `grok-4.3` | Lead PM — plan, review, synthesize |
| Reasoning | `claude-sonnet-4-6` | architect, review*, critic, analyst, … |
| Execution | `composer-2.5` | executor*, Sparrow, Vanguard execute, build-fixer, … |

---

## Web dashboard

```bash
npm run serve-dashboard
# → http://127.0.0.1:8081
node scripts/serve-dashboard.js --state-dir /path/to/.roland --port 8082
```

Overview (live progress + HITL buttons), run history, memory editor, and Command Board panel. Token counts are estimates (chars ÷ 4).

---

## Resilience defaults

| Setting | Default |
|---------|---------|
| Max concurrent agents | 2 |
| Agent retries | 4 (5 total attempts) |
| Circuit breaker | 1 network-error wave → HITL pause |
| Retry jitter | ±30% on all backoff delays |
| Warmup stagger | 1500 ms between slot starts |

On final agent failure, Roland returns a synthetic **BLOCKER** — the PM can re-scope instead of crashing the run.

---

## Installation options

| Method | Command |
|--------|---------|
| **Dev link** | `npm ci && npm run build && npm link` |
| **Global install** | `npm install -g .` from repo root |
| **One-command setup** | `curl -fsSL …/scripts/setup.sh \| bash` — see [INSTALLATION.md](INSTALLATION.md) |
| **MCP only** | `roland-mcp` or `npm run mcp` |

After any change to `src/` or YAML agents/recipes: `npm run build`.

Verify: `roland doctor` · `npm run test:run` · `node scripts/test-routing.mjs`

---

## Documentation

| Doc | Contents |
|-----|----------|
| **[DAILY-USAGE.md](DAILY-USAGE.md)** | Chat workflows, mid-run controls, troubleshooting |
| **[INSTALLATION.md](INSTALLATION.md)** | MCP setup for Cursor / VS Code |
| **[CLAUDE.md](CLAUDE.md)** | Developer guide — architecture, conventions, pitfalls |
| **[docs/evolution/](docs/evolution/README.md)** | UNSC orchestration, Command Blackboard, SDK patterns |
| **[docs/guides/mini-pc-deployment.md](docs/guides/mini-pc-deployment.md)** | Headless node, Tailscale, systemd, MCP on mini PC |
| **[docs/guides/pm-workflow.md](docs/guides/pm-workflow.md)** | Manual PM mode in Cursor chat |
| **[CHANGELOG.md](CHANGELOG.md)** | Version history |

---

## Development

```bash
npm run build           # tsc + copy agents/recipes to dist/
npm run dev             # watch mode
npm test                # Vitest
npm run test:run        # single pass
node scripts/test-routing.mjs      # model routing (8/8)
node scripts/test-signals.mjs      # worker signals (8/8)
node scripts/test-mcp-tools.mjs    # MCP smoke (8/8)
node scripts/test-retry-resilience.mjs  # retry/circuit (70/70)
```

---

## License

MIT © Adam McIntosh
