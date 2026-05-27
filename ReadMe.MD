# Roland

> A PM-first AI engineering team you run from the terminal.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Type a goal. Roland spins up a **Lead PM** (Claude Opus) that decomposes it into parallel tasks, dispatches them to a team of specialist engineers, reviews each wave of work, and delivers an executive-ready synthesis — all in your terminal with a live dashboard.

```bash
roland "add rate limiting to the Express API"
```

---

## ✨ North Star

Roland's goal is to feel like having a senior engineering team on call — one that understands your codebase, remembers prior decisions, works in parallel, and delivers production-ready results without hand-holding. You describe what you want. The team figures out how.

---

## 📦 Installation

**Prerequisites:** Node.js 18+, a `CURSOR_API_KEY`

```bash
git clone https://github.com/AdamMcIntosh/roland.git
cd roland
npm install
npm run build
npm link          # makes `roland` available globally
```

```bash
# Add to your shell profile (.zshrc / .bashrc / PowerShell $PROFILE)
export CURSOR_API_KEY=your_key_here
export ROLAND_NOTIFY=1          # optional: enable notifications everywhere
```

```bash
roland doctor     # verify the install
```

---

## 🚀 Quick Start

```bash
# Run your first team session
roland "write unit tests for the auth module"

# Review a GitHub PR (requires gh CLI)
roland pr 42

# Watch git — auto-run a team on every new commit
roland watch
```

That's it. Roland reads your project, plans the work, and prints a synthesis when done.

---

## 📖 Daily Usage

```bash
# ── New feature ──────────────────────────────────────────────────────
roland "add a /metrics endpoint that returns Prometheus-format counters"

# ── Refactor ─────────────────────────────────────────────────────────
roland "refactor the database layer to use the repository pattern"

# ── Bug investigation ─────────────────────────────────────────────────
roland "the login endpoint returns 500 intermittently — find and fix the root cause"

# ── PR review ────────────────────────────────────────────────────────
roland pr 87                    # review
roland pr 87 --fix              # review + implement fixes + commit

# ── Continuous review (background) ───────────────────────────────────
roland watch                    # fires on every git commit
roland watch --webhook https://ntfy.sh/my-alerts   # + phone notification

# ── Second terminal: live observer ────────────────────────────────────
roland status
```

> 💡 See [`DAILY-USAGE.md`](DAILY-USAGE.md) for a one-page cheat sheet with example workflows and pro tips.

---

## 📋 Command Reference

| Command | Description |
|---------|-------------|
| `roland "goal"` | Run a PM team on a goal _(shortcut for `roland team`)_ |
| `roland team "goal"` | Same, with full flag control |
| `roland watch` | Auto-run on git commits or file changes |
| `roland pr [number]` | Review / fix a GitHub PR via the `gh` CLI |
| `roland status` | Live TUI observer (run from a second terminal) |
| **Background mode** | |
| `roland team "..." --background` | Run detached; returns immediately |
| `roland bg-status` | Show running job: wave, phase, task progress |
| `roland bg-logs [--follow]` | Tail the background log (stream live with `--follow`) |
| `roland bg-stop` | Gracefully stop the background run |
| **Human-in-the-Loop** | _(while a run is active)_ |
| `roland pause` | Pause before the next wave |
| `roland resume` | Resume after a pause |
| `roland abort` | Stop after the current wave finishes |
| `roland inject "..."` | Post a directive to the Lead PM mid-run |
| `roland unblock <id> [msg]` | Send guidance to a blocked agent |
| `roland replan` | Ask PM to re-evaluate remaining tasks |
| `roland hitl-status` | Show pause state and command queue |
| **Utility** | |
| `roland doctor` | Diagnose install, agents, recipes, permissions |
| `roland pm-log` | Print the PM event timeline for the current project |
| `npm run serve-dashboard` | Web dashboard — command center (http://127.0.0.1:8081) |
| `roland mcp-config` | Print / merge the Cursor MCP config entry |
| `roland serve` | Start the MCP server (Cursor / VS Code) |
| `roland --help` | Full flag reference |
| `roland --version` | Print version |

---

### `roland team` — run a goal

```bash
roland "goal"                           # shortcut
roland team "goal"                      # explicit
roland team "goal" --stream             # print agent output as tasks complete
roland team "goal" --no-tui             # scrolling log instead of dashboard (CI-friendly)
roland team "goal" --quiet              # synthesis only, piped to stdout
roland team "goal" --notify             # desktop notification on complete/error
roland team "goal" --webhook <url>      # POST to ntfy.sh, Slack, Discord, or any URL
roland team "goal" --state-dir <dir>    # custom persistence dir (default: .roland)
roland team "goal" --clean              # wipe blackboard + messages before running (keep memory.md)
roland team "goal" --background         # run detached; returns immediately (monitor with roland bg-status)
roland team "goal" --no-improve         # skip the self-improvement retrospective phase
```

### `roland watch` — continuous mode

```bash
roland watch                            # git commits → commit message becomes the goal
roland watch --task "run full review"   # fixed goal on every change
roland watch --pattern "src/**/*.ts"    # watch file changes instead of git
roland watch --interval 30              # poll every 30 s (default: 60)
roland watch --once                     # run once on first change, then exit
roland watch --notify --webhook <url>   # notification on each run
```

### `roland pr` — GitHub PR review

```bash
roland pr 42                            # review PR #42
roland pr                               # auto-detect from current branch
roland pr 42 --fix                      # review + commit + push fixes
roland pr 42 --fix --branch fix/pr-42  # fixes on a named branch
roland pr 42 --notify
```

> Requires the [`gh` CLI](https://cli.github.com/) installed and authenticated.

### Background mode — long-running jobs

Run a team session detached from your terminal. The process continues even after you close the window.

```bash
roland team "goal" --background         # start detached (alias: roland run "goal" --detach)
```

Monitor and control:

```bash
roland bg-status                        # show goal, wave, phase, task progress
roland bg-status --json                 # machine-readable (for scripting / CI)
roland bg-logs                          # tail the most recent log (last 50 lines)
roland bg-logs --follow                 # stream live  (Ctrl+C to stop)
roland bg-stop                          # graceful stop: abort → waits → SIGTERM → SIGKILL
```

Logs are written to `.roland/logs/bg-<timestamp>.log`. Background mode auto-restarts on crash (up to 3 times with exponential back-off).

---

### Human-in-the-Loop Controls — steer a run in progress

Send commands to a **running** `roland team` session from any terminal in the same directory:

```bash
roland pause                                   # pause before the next wave
roland resume                                  # resume a paused run
roland abort                                   # stop after the current wave finishes
roland inject "use Redis for caching"          # post a directive to the Lead PM
roland unblock task-3 "use REST not gRPC"      # send guidance to a blocked agent
roland replan                                  # ask PM to re-evaluate remaining tasks
roland hitl-status                             # show pause state, abort pending, queue length
```

All HITL controls work with foreground and background (`--background`) runs. They're also available as buttons in the [Web Dashboard](#️-web-dashboard-20) whenever a run is active.

---

### Global flags _(team / watch / pr)_

| Flag | Description |
|------|-------------|
| `--notify`, `-n` | Desktop notification on complete / error |
| `--webhook <url>` | HTTP POST to any URL (ntfy.sh, Slack, Discord…) |
| `--state-dir <dir>` | Persistence directory (default: `.roland`) |
| `--quiet`, `-q` | Suppress progress; print synthesis to stdout only |
| `--no-tui` | Scrolling log instead of the live dashboard |
| `--simple-tui`, `--no-fancy` | ASCII-only scrolling output (mobile SSH, Termius, limited terminals) |

---

## 🎛 Web Dashboard 2.0

A full command center for Roland — live WebSocket updates, 4-tab navigation, HITL controls built in.

```bash
npm run serve-dashboard
# → http://127.0.0.1:8081
```

### Tabs

| Tab | Contents |
|-----|----------|
| **Overview** | Stats cards (runs, cost, tokens, active jobs) · Live job progress with **Pause / Resume / Replan / Abort** buttons · Recent run cards filterable by Today / Week / Month / All Time |
| **History** | All past runs, searchable by goal · Click any run to expand: full task list, wave decisions, blockers |
| **Memory** | Browse all five knowledge sections of `.roland/memory.md` · Inline editor: edit and save directly from the browser |
| **Actions** | New run form · Watch Mode toggle · PR review input · Recent goals as one-click chips · Live HITL panel |

### Live updates via WebSocket

The dashboard connects via WebSocket and receives push updates whenever `run-state.json` or `hitl-state.json` changes. Task status, blockers, and pause state update instantly — no polling delay.

### HITL from the browser

The **Overview** tab shows **Pause**, **Resume**, **Replan**, and **Abort** buttons whenever a run is active. These write directly to `.roland/hitl.json` — same as running `roland pause` / `roland resume` in the terminal.

### Pointing it at your project

```bash
# Current directory's .roland/:
npm run serve-dashboard

# Different project or state directory:
node scripts/serve-dashboard.js --state-dir /path/to/project/.roland
node scripts/serve-dashboard.js --state-dir /path/to/project/.roland --port 8082
```

### Backfilling existing projects

Usage data is recorded automatically from the next `roland team` run. To create an entry from a previous run's `run-state.json`:

```bash
node scripts/backfill-usage.mjs --state-dir /path/to/project/.roland
```

### Demo data (trying it out without a real run)

```bash
node scripts/seed-usage-demo.mjs          # seeds 12 realistic demo runs into .roland/
npm run serve-dashboard                   # open http://127.0.0.1:8081
```

> **Note:** Token counts and costs are **estimates** (input chars ÷ 4 ≈ tokens). Actual charges depend on your Cursor API tier and are not exposed by the SDK.

---

## 💬 Using Roland in Cursor Chat

Roland is a registered MCP server — once connected, it appears in Cursor as a set of powerful tools **and** as a first-class chat persona. Type naturally and Roland triages your request, handles small tasks directly, or spins up the full PM team for complex goals.

### 1 · Connect Roland to Cursor

```bash
# In the roland repo directory:
roland mcp-config --write    # merges entry into ~/.cursor/mcp.json

# Then restart Cursor.
# Verify it's live: open Cursor chat and type:
# @roland hello
```

> The `mcp-config` command writes a single entry to `~/.cursor/mcp.json`:
> ```json
> { "mcpServers": { "roland": { "command": "node", "args": ["dist/index.js"] } } }
> ```
> If you installed globally (`npm link`), you can also use `"command": "roland", "args": ["serve"]`.

---

### 2 · Activate the Roland chat persona

Roland ships a Cursor Rules file that turns your chat session into an interactive PM session:

1. Open **Cursor Settings** → **Rules** → **Project Rules**
2. You will see the `roland` rule listed (from `.cursor/rules/roland.mdc` in this repo)
3. Enable it — or attach it to a conversation via the 📎 **rules** button in the chat toolbar

Once active, every chat message is triaged through Roland:
- **Small tasks** are handled directly in chat (file edits, explanations, quick fixes)
- **Complex goals** trigger an offer to run the full PM team

---

### 3 · Talk to Roland

```
# Start a session — Roland greets you with project state:
@roland hello

# Small task — Roland edits directly:
@roland why does the login endpoint return 401 intermittently?

# Complex goal — Roland offers to launch the team:
@roland add complete OAuth2 support with GitHub and Google providers

# Check team progress:
@roland what's the status?

# Launch a standard recipe workflow:
start_team_recipe({ "recipe": "bugfix-team", "goal": "fix memory leak in WebSocket handler" })
```

---

### 4 · Roland's tools in Cursor chat

These MCP tools are available directly in the Cursor chat tool palette:

| Tool | Description |
|------|-------------|
| `roland_hello` | Welcome message + current project state |
| `roland_run_team` | Launch a background PM team run for a complex goal |
| `pm_standup` | Board snapshot — blockers first, then suggested actions |
| `get_team_context` | Full structured board state |
| `spawn_task` | Add a task to the board manually |
| `unblock_task` | Resolve a blocker with a concrete decision |
| `synthesize_deliverable` | Roll up all completed work into a final summary |
| `start_team_recipe` | Instantiate: `full-feature-team` · `bugfix-team` · `refactor-team` |
| `triage` | Route any message to the best agent persona |

---

### 5 · Example conversation

```
You:    @roland add pagination to the users API endpoint

Roland: [triages → medium complexity]
        Focused implementation — I'll handle this directly. Reading the users route…

        [reads src/routes/users.ts, src/controllers/users.ts]

        Plan:
        1. Add `?limit=20&cursor=<id>` query params to GET /users
        2. Return `{ data: User[], nextCursor: string | null }` shape
        3. Update the OpenAPI spec
        4. Add tests for edge cases (empty result, last page)

        Making changes now…
        [edits files]

        ✅ Done. Cursor-based pagination added to GET /users.
        Run `npm test` to confirm — tests added in test/routes/users.test.ts.
```

```
You:    @roland build a full multi-tenant billing system with Stripe

Roland: [triages → complex]
        That's a full-team job — architect (schema design), executor (Stripe
        integration + webhooks), test-author (coverage), security-reviewer (PCI
        surface). Estimated 3 waves, ~25 min. Kick it off?

You:    yes

Roland: [calls roland_run_team({ goal: "multi-tenant billing with Stripe — subscriptions,
        usage-based pricing, webhook handling, and PCI-compliant card storage" })]

        ✅ Team started (PID 48291). Wave 1 planning now.
        Call pm_standup() any time for live status, or run `roland status` in your terminal.
```

---

### 6 · Per-project MCP config (optional)

For projects that always use Roland, commit a `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "roland": {
      "command": "node",
      "args": ["/absolute/path/to/roland/dist/index.js"]
    }
  }
}
```

This auto-connects Roland for every team member who opens the project in Cursor — no manual setup required.

---

## ⚙️ Configuration

### Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CURSOR_API_KEY` | _(required)_ | API key for agent execution |
| `ROLAND_NOTIFY` | `0` | Set to `1` to enable notifications for all commands |
| `ROLAND_SIMPLE_TUI` | `0` | Set to `1` for ASCII-only output — mobile SSH, Termius, limited terminals |
| `ROLAND_AGENT_TIMEOUT_MS` | `1500000` (25 min) | Per-agent hard timeout |
| `ROLAND_AGENT_RETRIES` | `2` | Max retries before a synthetic BLOCKER is raised |

### Notification webhooks

Roland auto-detects the webhook format:

| URL pattern | Format |
|-------------|--------|
| `https://ntfy.sh/*` | Plain-text body + Title / Priority / Tags headers |
| Everything else | JSON `{ text, title, body, event, goal }` |

**ntfy.sh (recommended for mobile):**
```bash
# Subscribe to a topic in the ntfy app, then:
roland watch --webhook https://ntfy.sh/my-roland-alerts
```

**Slack / Discord / custom webhook:**
```bash
roland team "goal" --webhook https://hooks.slack.com/services/...
```

For non-ntfy.sh URLs, Roland POSTs this JSON body:
```json
{
  "text": "✅ Roland complete: \"add rate limiting\"",
  "title": "Roland complete",
  "body": "\"add rate limiting\" · 8 tasks · 2 waves · 4m 23s",
  "event": "complete",
  "goal": "add rate limiting to the Express API"
}
```

`event` is one of `complete | error | blocker | wave-complete | hitl-pause`. Use your webhook handler to route, filter, or reformat.

### Persistence (`.roland/` directory)

All state is stored in `.roland/` inside your project:

| File | Contents |
|------|----------|
| `memory.md` | Cross-run knowledge — tech stack, patterns, things to avoid |
| `blackboard.json` | Shared task context — results, blockers, inter-agent messages |
| `run-state.json` | Live run state (read by `roland status` and the web dashboard) |
| `messages.json` | Agent-to-agent message bus |
| `usage-history.json` | Per-run token and cost estimates — grows automatically with every run |

Roland reads `memory.md` at the start of every run and updates it after synthesis. The more you use Roland on a project, the better it knows it.

---

## 🔬 How It Works

```
You type a goal
      │
      ▼
Lead PM  (claude-opus-4-7)
  ├─ reads .roland/memory.md   ← decisions from prior runs
  ├─ reads .roland/blackboard  ← current project state
  └─ decomposes into tasks
      │
      ▼
Wave 1 — parallel execution
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
  ├─ executive-ready summary → stdout
  ├─ .roland/memory.md updated  (decisions / patterns / avoid list)
  └─ notification fired  (desktop / webhook / stderr)
```

**Agent roster** — 30+ specialist personas, YAML-defined in `agents/`. Each run selects the right specialists for the goal. Common assignments:

| Agent | Role |
|-------|------|
| `architect` | System design, trade-off analysis |
| `executor` | Implementation and coding |
| `test-author` | Test strategy and authoring |
| `test-executor` | Test execution and triage |
| `code-reviewer` | Comprehensive code review |
| `security-reviewer` | Security auditing and hardening |
| `writer` | Documentation and technical writing |

---

## 💡 Tips & Best Practices

**Write goals like you'd brief a senior engineer.**
Be specific about scope, constraints, and what "done" looks like.
```bash
# ✅ Good
roland "add JWT refresh token rotation to the auth service — tokens expire in 15 min, refresh in 7 days, store in Redis"

# ⚠️ Vague
roland "fix auth"
```

**Let project memory accumulate.**
After a few runs, Roland knows your stack, naming conventions, and past decisions. Don't clear `.roland/memory.md` unless you're starting fresh on a new project.

**Use `--no-tui` in CI / scripts.**
The live dashboard only works in interactive terminals.
```bash
roland team "run the full review suite" --no-tui --quiet >> review.md
```

**On mobile SSH or Termius? Use simple mode.**
The fancy TUI uses alternate-screen buffer codes that some SSH clients mishandle, producing garbage like `^[[A[[A`. Simple mode scrolls cleanly on any terminal.
```bash
# Set once in your shell profile (applies to every command):
export ROLAND_SIMPLE_TUI=1

# Or per-run:
roland team "goal" --simple-tui
roland status --simple-tui
```

**Pair `roland watch` with `--once` for pre-push hooks.**
```bash
# .git/hooks/pre-push
roland watch --once --task "review staged changes for obvious issues" --no-tui --quiet
```

**Get phone notifications with ntfy.sh (free).**
```bash
# Install the ntfy app, subscribe to a topic, then:
export ROLAND_NOTIFY=1
roland watch --webhook https://ntfy.sh/your-unique-topic
```

**Review large PRs in stages.**
```bash
roland pr 142               # get the lay of the land
roland pr 142 --fix         # second pass: implement improvements
```

**Run `roland doctor` after any install change.**
```bash
roland doctor
```

---

## 🔧 Troubleshooting

**`CURSOR_API_KEY is not set`**
```bash
export CURSOR_API_KEY=your_key_here   # add to .zshrc / .bashrc / PowerShell $PROFILE
roland doctor                          # verify the full install
```

**Agent timeout — run stalls or never completes**

Default timeout is 25 minutes per agent. Override for complex tasks or fast-fail in CI:
```bash
ROLAND_AGENT_TIMEOUT_MS=900000 roland "goal"    # 15-minute timeout
ROLAND_AGENT_TIMEOUT_MS=60000  roland "goal"    # 1-minute timeout (testing)
```

**Garbled output on mobile SSH / Termius**

The fancy TUI uses alternate-screen ANSI codes that some SSH clients mishandle (`^[[A[[A` garbage). Fix:
```bash
export ROLAND_SIMPLE_TUI=1    # add to shell profile — clean scrolling on any terminal
roland team "goal" --simple-tui  # or per-run
```

**`roland status` shows "No run-state found"**

The run hasn't started yet, already finished, or used a custom `--state-dir`:
```bash
roland bg-status                                     # check if a background run is active
roland status --state-dir /path/to/project/.roland   # custom dir
```

**Memory file `.roland/memory.md` looks corrupted**

Open `http://127.0.0.1:8081` → **Memory** tab to view and edit it in the browser. Or edit the file directly — it's plain Markdown with `## Section Name` headers and `- bullet` lists.

**Background run crashed without finishing**
```bash
roland bg-logs               # tail the most recent log
roland bg-status             # check if PID file still exists (.roland/supervisor.pid)
```
Log files persist at `.roland/logs/bg-<timestamp>.log` even after the process exits.

**`roland doctor` shows failures**
```bash
roland doctor       # shows exactly which check failed and how to fix it
npm run build       # re-run if agents/ or recipes/ are missing from dist/
```

---

## 🛠 Development

```bash
npm run build           # compile TypeScript → dist/
npm run dev             # watch mode (auto-rebuild)
npm test                # run test suite
npm run test:run        # run once (no watch)
npm run lint            # lint check
npm run clean           # remove dist/
```

---

## 📚 Documentation

| Doc | Contents |
|-----|----------|
| [`DAILY-USAGE.md`](DAILY-USAGE.md) | One-page cheat sheet — workflows, flags, pro tips |
| [`CLAUDE.md`](CLAUDE.md) | Developer guide — architecture, conventions, pitfalls |
| [`CHANGELOG.md`](CHANGELOG.md) | Version history |

---

## License

MIT © Adam McIntosh
