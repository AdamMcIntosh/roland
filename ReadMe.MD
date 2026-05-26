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
| `roland doctor` | Diagnose install, agents, recipes, permissions |
| `roland pm-log` | Print the PM event timeline for the current project |
| `npm run serve-dashboard` | Web dashboard — live status, usage & cost history (http://127.0.0.1:8081) |
| `roland mcp-config` | Print / merge the Cursor MCP config entry |
| `roland serve` | Start the MCP server (default with no subcommand) |
| `roland --help` | Full flag reference |

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

### Global flags _(team / watch / pr)_

| Flag | Description |
|------|-------------|
| `--notify`, `-n` | Desktop notification on complete / error |
| `--webhook <url>` | HTTP POST to any URL (ntfy.sh, Slack, Discord…) |
| `--state-dir <dir>` | Persistence directory (default: `.roland`) |
| `--quiet`, `-q` | Suppress progress; print synthesis to stdout only |
| `--no-tui` | Scrolling log instead of the live dashboard |

---

## 📊 Usage Dashboard

A browser-based dashboard that serves as Roland's central hub — showing live job status during a run and historical usage, cost, and agent breakdown across all runs.

```bash
# From your project directory:
npm run serve-dashboard
# → http://127.0.0.1:8081
```

The dashboard auto-refreshes: live run status every 5 s, usage history every 30 s. It's useful at any time — not just during active runs.

### What it shows

| Section | Contents |
|---------|----------|
| **Overview cards** | Total runs · Est. cost · Tokens used · Active jobs — all filterable by Today / Week / Month / All Time |
| **Live Status** | Current job goal, wave progress, per-task status (pending / running / done / blocked) with elapsed times |
| **Recent Runs** | Last 10 runs — status icon, duration, cost, click to expand task list |
| **Usage Trends** | Tokens + cost over time (line chart) and model distribution (doughnut) |
| **Agent Breakdown** | Sortable table: every agent's token count, cost estimate, call count, and avg duration |

### Pointing it at your project

`npm run serve-dashboard` reads `.roland/` in the current directory. For a project in a different location:

```bash
node scripts/serve-dashboard.js --state-dir /path/to/project/.roland
node scripts/serve-dashboard.js --state-dir /path/to/project/.roland --port 8082
```

### Backfilling existing projects

Usage data is recorded automatically from the next `roland team` run onward. To create a synthetic entry from a previous run's `run-state.json`:

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

## ⚙️ Configuration

### Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CURSOR_API_KEY` | _(required)_ | API key for agent execution |
| `ROLAND_NOTIFY` | `0` | Set to `1` to enable notifications for all commands |
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

**Slack / Discord:**
```bash
roland team "goal" --webhook https://hooks.slack.com/services/...
```

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
Lead PM  (grok-4.3)
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
