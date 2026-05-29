# Roland

> Your AI engineering team. Just type what you want.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Run `roland` in any project directory. Type a goal. A **Lead PM** decomposes it into parallel tasks, dispatches a team of specialist agents, reviews each wave of work, and delivers a synthesis — all in a clean, conversational terminal interface.

```
  ╭──────────────────────────────────────────────────────────────╮
  │                                                              │
  │  Roland  AI Engineering Team                                 │
  │                                                              │
  ├──────────────────────────────────────────────────────────────┤
  │  Type a goal to run your team                                │
  │  /help for commands  ·  /exit to quit                        │
  │                                                              │
  ╰──────────────────────────────────────────────────────────────╯

  State: .roland  ·  notify: off  ·  stream: off  ·  improve: on

  ❯ add rate limiting to the password reset endpoint

  You  ·  add rate limiting to the password reset endpoint

  ○  Roland  ·  Planning your team…
  ✓  Roland  ·  5 tasks planned  ·  est. ~3 min

  ──────────────────────────────────────────────────────────────
  Wave 1  ·  3 tasks  ████████░░░░░░  0/5

  →  architect             Audit existing rate limiting & auth patterns
  →  executor              Implement Redis-backed rate limiter middleware
  →  security-reviewer     Review password reset for timing attacks

  ✓  architect             Audit existing rate limiting & auth patterns    38s
  ✓  security-reviewer     Review password reset for timing attacks        51s
  ✓  executor              Implement Redis-backed rate limiter middleware   2m 14s

  └  Wave done  ·  2m 18s  ·  PM approved
  ...
  ════════════════════════════════════════════════════════════════
  ✓  Complete  ·  5 tasks  ·  2 waves  ·  clean  ·  4m 06s
  ════════════════════════════════════════════════════════════════

  What's next?
  ❯
```

---

## 📦 Installation

**Prerequisites:** Node.js 18+, a `CURSOR_API_KEY`

```bash
git clone https://github.com/AdamMcIntosh/roland.git
cd roland
npm install && npm run build
npm link          # makes `roland` available globally
```

```bash
# Add to your shell profile (.zshrc / .bashrc / PowerShell $PROFILE):
export CURSOR_API_KEY=your_key_here
export ROLAND_NOTIFY=1          # optional: enable notifications everywhere
```

```bash
roland doctor     # verify the install
```

---

## 🚀 Quick Start

```bash
# Start the interactive chat interface (recommended)
roland

# Or run a single goal directly
roland "add rate limiting to the Express API"

# Review a GitHub PR (requires gh CLI)
roland pr 42

# Watch git — auto-run on every new commit
roland watch
```

---

## 💬 Chat Mode — The Default Experience

Running `roland` with no arguments starts an interactive chat session. Type goals naturally, use slash commands to control runs, and stay in the flow without switching windows.

```bash
roland           # starts chat
roland chat      # same, explicit
```

### What you can do inside chat

**Run goals** — just type:
```
❯ add OAuth2 support with GitHub and Google providers
❯ refactor the database layer to use the repository pattern
❯ the login endpoint returns 500 intermittently — find and fix the root cause
```

**Control a live run:**
```
❯ /pause          pause before the next wave
❯ /resume         resume
❯ /abort          stop after the current wave
❯ /inject "focus on the Redis integration"    PM directive mid-run
❯ /replan         ask PM to re-evaluate
❯ /unblock task-3 "use REST not gRPC"         unblock a stalled agent
❯ /status         show current run state with progress bar
```

**Background jobs:**
```
❯ /bg-status      check a detached run
❯ /bg-logs        tail the background log
❯ /bg-stop        stop the background run
```

**Settings (persist within the session):**
```
❯ /stream         toggle task output previews
❯ /notify         toggle desktop notifications
❯ /improve        toggle self-improvement retrospective
❯ /state-dir .roland-myproject    point at a different project
```

**Meta:**
```
❯ /refine "fix the failing tests"   run a follow-up goal
❯ /clear                            clear the screen + redraw welcome
❯ /help                             show full command reference
❯ /exit                             quit
```

**Tips:**
- Up / down arrows navigate command history
- Tab autocompletes slash commands
- Ctrl+C on an empty line shows a hint rather than exiting (like Claude Code)
- Ctrl+D exits cleanly

---

## 📋 Command Reference

### One-liner mode _(no chat session)_

```bash
roland "goal"                           # shortcut for `roland team "goal"`
roland team "goal"                      # with full flag control
roland team "goal" --stream             # print agent output as tasks complete
roland team "goal" --no-tui             # scrolling log (CI-friendly)
roland team "goal" --quiet              # synthesis to stdout only, no progress
roland team "goal" --notify             # desktop notification on complete/error
roland team "goal" --webhook <url>      # POST to ntfy.sh, Slack, Discord, etc.
roland team "goal" --state-dir <dir>    # custom persistence dir (default: .roland)
roland team "goal" --background         # run detached; returns immediately
roland team "goal" --no-improve         # skip the self-improvement retrospective
roland team "goal" --simple-tui         # ASCII-only output (mobile SSH, Termius)
```

### Background mode

Run detached from your terminal — survives window closes, auto-restarts on crash (up to 3×).

```bash
roland team "goal" --background         # start detached
roland bg-status                        # show goal, wave, task progress
roland bg-status --json                 # machine-readable
roland bg-logs                          # tail last 50 lines
roland bg-logs --follow                 # stream live (Ctrl+C to stop)
roland bg-stop                          # graceful stop
```

Logs: `.roland/logs/bg-<timestamp>.log`

### Human-in-the-Loop controls _(while a run is active)_

```bash
roland pause                                   # pause before the next wave
roland resume                                  # resume
roland abort                                   # stop after current wave
roland inject "use Redis for caching"          # post a directive to the Lead PM
roland unblock task-3 "use REST not gRPC"      # unblock a stalled agent
roland replan                                  # ask PM to re-evaluate remaining tasks
```

These work whether the run is in the foreground, background, or chat mode. They're also available as buttons in the [Web Dashboard](#-web-dashboard).

### Other commands

```bash
roland watch                    # run on every git commit (commit message = goal)
roland watch --task "review"    # fixed task on every change
roland watch --pattern "src/**" # file-change trigger instead of git
roland pr 42                    # review PR #42
roland pr 42 --fix              # review + implement fixes + commit
roland status                   # live TUI observer (separate terminal)
roland doctor                   # diagnose the install
roland pm-log                   # PM event timeline for the current project
roland mcp-config               # print / merge the Cursor MCP entry
roland serve                    # start the MCP server (Cursor / VS Code)
```

### Global flags

| Flag | Description |
|------|-------------|
| `--notify`, `-n` | Desktop notification on complete / error |
| `--webhook <url>` | HTTP POST (ntfy.sh, Slack, Discord…) |
| `--state-dir <dir>` | Persistence directory (default: `.roland`) |
| `--quiet`, `-q` | Suppress progress; print synthesis to stdout only |
| `--no-tui` | Scrolling log instead of the live dashboard |
| `--simple-tui`, `--no-fancy` | ASCII-only output (SSH, Termius, narrow terminals) |

---

## 🔬 How It Works

```
You type a goal
      │
      ▼
Lead PM  (grok-4.3)
  ├─ reads .roland/memory.md       ← decisions from prior runs
  ├─ reads .roland/blackboard.json ← current project state
  └─ decomposes into a task plan
      │
      ▼
Wave 1 — parallel execution  (composer-2.5)
  ├─ executor      → implements the feature
  ├─ architect     → reviews the design
  └─ test-author   → writes tests
      │
      ▼
PM reviews wave → continue / adjust / unblock
      │
      ▼
Wave 2 — test-executor, code-reviewer, doc-writer …
      │
      ▼
PM synthesises
  ├─ executive-ready summary  → stdout (pipeable)
  ├─ .roland/memory.md updated
  └─ self-improvement retrospective (optional, interactive)
```

### Model policy

| Role | Model | Who uses it |
|------|-------|-------------|
| **PM** | `grok-4.3` | `lead-pm` — planning, review, synthesis |
| **Execution** | `composer-2.5` | All worker agents (executor, architect, test-author, test-executor, code-reviewer, security-reviewer, writer, …) |

The Lead PM is the orchestrator — it decomposes goals into parallel tasks and makes real-time decisions about which tasks to run, in what order, and how to unblock stalled work. All specialist agents are uniform executors running the same powerful reasoning model.

### Agent roster

45+ specialist personas defined in `agents/*.yaml`. Common assignments:

| Agent | Role |
|-------|------|
| `architect` | System design, trade-off analysis |
| `executor` | Implementation and coding |
| `test-author` | Test strategy and authoring (≤ 8–10 files per task) |
| `test-executor` | Test execution and triage |
| `code-reviewer` | Comprehensive code review |
| `security-reviewer` | Security auditing and hardening |
| `writer` | Documentation and technical writing |

---

## 🎛 Web Dashboard

A browser-based command center — live progress, usage history, HITL controls, and memory editor.

```bash
npm run serve-dashboard          # → http://127.0.0.1:8081
node scripts/serve-dashboard.js --state-dir /path/to/project/.roland --port 8082
```

### Tabs

| Tab | Contents |
|-----|----------|
| **Overview** | Stats cards · Live job progress · **Pause / Resume / Replan / Abort** buttons · Recent run cards |
| **History** | All past runs, searchable · Click to expand: task list, wave decisions, blockers |
| **Memory** | Browse all five knowledge sections of `.roland/memory.md` · Inline editor |
| **Actions** | New run form · Watch Mode toggle · PR review input · Recent goals as one-click chips |

Updates are pushed via WebSocket — no polling delay.

```bash
# Seed demo data (try the dashboard without a real run):
node scripts/seed-usage-demo.mjs
npm run serve-dashboard

# Backfill a previous run's usage data:
node scripts/backfill-usage.mjs --state-dir .roland
```

> Token counts and costs are estimates (chars ÷ 4). Actual Cursor API charges are not exposed by the SDK.

---

## 🧠 Project Memory & Self-Improvement v2

Roland learns your project over time.

### Automatic memory

After every synthesis, Roland updates `.roland/memory.md` with:
- **Architecture Decisions** — patterns and tech choices
- **Coding Standards** — naming, testing, file layout
- **Past Mistakes** — "never do X" bullets with root causes
- **Preferences** — your team's explicit preferences
- **Project Gotchas** — environment quirks and API surprises

The longer you use Roland on a project, the better it knows it.

### Self-improvement retrospective

After each synthesis, Roland runs a structured 5-question retrospective — what went well, root causes of blockers, wrong assumptions, gotchas, and new standards. It proposes memory updates and **auto-accepts after 15 seconds** (you can review and reject inline). Disable with `--no-improve` or `/improve off` in chat.

### Smart recall

Instead of dumping the full memory, Roland scores bullets by keyword overlap with your current goal and injects only the most relevant context — keeping prompts lean without losing institutional knowledge.

---

## ⚙️ Resilience & Performance

Roland is built for unreliable networks (SSH, mobile, unstable connections).

### Defaults

| Setting | Default | Purpose |
|---------|---------|---------|
| **Max concurrent agents** | 2 | Stagger TCP connections to API |
| **Circuit breaker threshold** | 1 | Pause on first wave of network errors |
| **Agent warmup delay** | 1500 ms | Space out worker slot starts |
| **Agent timeout** | 1500000 ms (25 min) | Per-agent wall-clock limit |
| **Max retries** | 4 | 5 total attempts (1 initial + 4 retries) |

**Retry sequences:**
- Network errors: 2s → 5s → 10s → 20s → 30s (fast recovery)
- Generic SDK errors: 5s → 10s → 20s → 30s → 45s (slower recovery)

All values include ±30% jitter to prevent thundering herd.

### Environment variable overrides

| Variable | Default | Example |
|----------|---------|---------|
| `ROLAND_MAX_CONCURRENT` | `2` | `ROLAND_MAX_CONCURRENT=4` on fast, stable connections |
| `ROLAND_CIRCUIT_BREAKER` | `1` | `ROLAND_CIRCUIT_BREAKER=3` to tolerate more errors |
| `ROLAND_WARMUP_DELAY_MS` | `1500` | `ROLAND_WARMUP_DELAY_MS=0` to disable staggering |
| `ROLAND_AGENT_TIMEOUT_MS` | `1500000` | `ROLAND_AGENT_TIMEOUT_MS=900000` for 15-minute timeout |
| `ROLAND_AGENT_RETRIES` | `4` | `ROLAND_AGENT_RETRIES=2` for 3 total attempts |

---

## 🔧 Configuration

### Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CURSOR_API_KEY` | _(required)_ | API key for agent execution |
| `ROLAND_NOTIFY` | `0` | `1` = enable notifications for all commands |
| `ROLAND_SIMPLE_TUI` | `0` | `1` = ASCII-only output (mobile SSH, Termius) |
| `ROLAND_STATE_DIR` | `.roland` | Default persistence directory |

### Notifications

Roland auto-detects the webhook format:

| URL pattern | Format |
|-------------|--------|
| `https://ntfy.sh/*` | Plain-text body + Title / Priority / Tags headers |
| Everything else | JSON `{ text, title, body, event, goal }` |

```bash
# Phone (ntfy.sh — free, iOS + Android):
roland watch --webhook https://ntfy.sh/my-roland-alerts

# Slack / Discord / custom:
roland team "goal" --webhook https://hooks.slack.com/services/...
```

Events: `complete | error | blocker | wave-complete | hitl-pause`

### Persistence (`.roland/` directory)

| File | Contents |
|------|----------|
| `memory.md` | Cross-run knowledge — grows with every run |
| `blackboard.json` | Shared task context; cleared with `--clean` |
| `run-state.json` | Live run state (read by `roland status` and dashboard) |
| `messages.json` | Agent-to-agent message bus |
| `usage-history.json` | Per-run token and cost estimates |
| `hitl.json` | HITL command queue |
| `logs/bg-*.log` | Background run logs |

---

## 💡 Tips & Best Practices

**Write goals like a senior engineer brief** — specific scope, constraints, and definition of done:
```bash
# ✅ Clear
roland "add JWT refresh token rotation — 15 min access, 7 day refresh, Redis storage"

# ⚠️ Vague
roland "fix auth"
```

**Let project memory accumulate.** Don't clear `.roland/memory.md` between runs on the same project — it's the superpower.

**Use chat mode for exploratory work.** The `/refine` command is great for iterating: run the first goal, see the synthesis, then refine.

**Use `--no-tui --quiet` in CI:**
```bash
roland team "run the full review suite" --no-tui --quiet > review.md
```

**On mobile SSH or Termius:** Roland auto-detects limited SSH environments and switches to simple mode. If it doesn't:
```bash
export ROLAND_SIMPLE_TUI=1    # add to shell profile
```

**Background + webhook = async workflow:**
```bash
roland team "long refactor" --background --webhook https://ntfy.sh/my-topic
# Do other work; get a phone notification when done
```

---

## 🔧 Troubleshooting

**`CURSOR_API_KEY is not set`**
```bash
export CURSOR_API_KEY=your_key_here
roland doctor
```

**Garbled output on SSH / Termius** (`^[[A[[A` garbage)
```bash
export ROLAND_SIMPLE_TUI=1    # add to shell profile
```
Roland also auto-detects SSH sessions without declared truecolor support and falls back automatically.

**Agent timeout — run stalls**
```bash
ROLAND_AGENT_TIMEOUT_MS=900000 roland "goal"    # 15-minute timeout
```

**`/status` shows "No run state found"**
```bash
roland bg-status                                     # check background run
roland status --state-dir /path/to/project/.roland   # custom dir
```

**Network errors (ECONNRESET, socket hangs) on SSH**

This is the circuit breaker protecting you. After a wave of network failures, Roland pauses and waits for you to resume:
```bash
# Check logs
roland bg-logs

# Resume when the network is stable
roland resume

# Or increase tolerance
ROLAND_CIRCUIT_BREAKER=3 roland team "goal"
```

**`.roland/memory.md` looks wrong**

Open `http://127.0.0.1:8081` → **Memory** tab to view and edit in the browser. Or edit the file directly — plain Markdown with `## Section Name` headers.

**Background run crashed**
```bash
roland bg-logs               # tail the most recent log
roland bg-status             # check if PID file still exists
```

**`roland doctor` shows failures**
```bash
roland doctor       # shows exactly which check failed
npm run build       # re-run if agents/ or recipes/ are missing from dist/
```

---

## 🖥 Using Roland in Cursor Chat

Roland is also a registered MCP server. Connect it once and use it from Cursor's chat pane.

```bash
roland mcp-config --write    # merges entry into ~/.cursor/mcp.json
# Restart Cursor, then: @roland hello
```

| Tool | Description |
|------|-------------|
| `roland_run_team` | Launch a background PM team run |
| `pm_standup` | Board snapshot — blockers first, then actions |
| `get_team_context` | Full structured board state |
| `spawn_task` | Add a task to the board manually |
| `unblock_task` | Resolve a blocker with a concrete decision |
| `synthesize_deliverable` | Roll up all completed work |
| `start_team_recipe` | Instantiate: `full-feature-team` · `bugfix-team` · `refactor-team` |

---

## 🛠 Development

```bash
npm run build           # compile TypeScript → dist/
npm run dev             # watch mode (auto-rebuild)
npm test                # run test suite (Vitest)
npm run test:run        # single pass
npm run lint            # lint check
node scripts/test-routing.mjs            # model routing smoke test (8/8)
node scripts/test-signals.mjs            # signal parser smoke test (8/8)
node scripts/test-retry-resilience.mjs   # retry/circuit-breaker smoke test (70/70)
```

---

## 📚 Documentation

| Doc | Contents |
|-----|----------|
| [`DAILY-USAGE.md`](DAILY-USAGE.md) | Practical daily guide — workflows, chat commands, troubleshooting |
| [`CLAUDE.md`](CLAUDE.md) | Developer guide — architecture, conventions, pitfalls |
| [`CHANGELOG.md`](CHANGELOG.md) | Version history |

---

## License

MIT © Adam McIntosh
