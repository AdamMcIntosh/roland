# Roland — Daily Usage Guide

> Roland as your AI engineering teammate — practical patterns for real work.

---

## ⚡ The 30-Second Version

```bash
roland          # open the chat interface
```

Type a goal. Watch the team work. Read the synthesis. Type another goal.

That's the whole loop.

---

## 🗂 Starting a New Task

Open chat and describe the work the way you'd brief a senior engineer — specific scope, constraints, and what "done" looks like:

```
❯ add a /metrics endpoint that returns Prometheus-format counters
  for HTTP requests (method, path, status, duration)

❯ refactor the payment service to use the Strategy pattern —
  no behaviour changes, all existing tests must still pass

❯ the POST /orders endpoint returns 422 for valid payloads —
  find the root cause and fix it, add a regression test

❯ audit the authentication flow for OWASP Top 10 issues,
  JWT misconfigurations, and session management problems
```

**Specificity matters.** Roland plans based on your goal text. The more context you give — file names, constraints, what must NOT change — the better the plan.

```bash
# ✅ Clear goal
❯ add JWT refresh token rotation — 15 min access token, 7 day refresh,
  store in Redis with user ID as key prefix

# ⚠️ Vague goal
❯ fix auth
```

---

## 👀 What Happens Next

```
  ○  Roland  ·  Planning your team…
  ✓  Roland  ·  5 tasks planned  ·  est. ~8 min

  ──────────────────────────────────────────────
  Wave 1  ·  3 tasks  ████░░░░░░░░░░  0/5

  →  architect           Design the token rotation scheme
  →  executor            Implement the refresh token service
  →  security-reviewer   Audit for token replay and timing attacks

  ✓  architect           Design the token rotation scheme          38s
  ✓  security-reviewer   Audit for token replay and timing attacks  51s
  ✓  executor            Implement the refresh token service        2m 14s

  └  Wave done  ·  2m 18s  ·  PM approved
```

Dim `→` lines = agents working. Bright `✓` lines = tasks done. The wave closes with a single summary line — no noise.

**The Lead PM (grok-4.3)** orchestrates the whole run:
1. **Planning** — decomposes your goal into parallel tasks
2. **Review** — after each wave, examines results and decides whether to continue, adjust, or unblock
3. **Synthesis** — produces the final executive summary when all tasks are done

All **specialist agents (executor, architect, test-author, etc.)** run composer-2.5 — a fast, reasoning-capable model that balances speed with depth.

---

## 🎛 Mid-Run Controls

You can steer a run while it's in progress, without interrupting it.

### From chat (easiest)

```
❯ /pause           pauses before the next wave starts
❯ /resume          resumes a paused run
❯ /abort           stops cleanly after the current wave
```

### Inject a directive

If the PM is about to do something you want to redirect:

```
❯ /inject "focus on the Redis integration, not the HTTP layer"
```

The Lead PM sees this message on the next wave review and adjusts the plan accordingly.

### Replan

If the work is going in the wrong direction:

```
❯ /replan
```

The PM will re-evaluate all remaining tasks on the next review.

### Unblock a stalled task

If an agent reports a BLOCKER:

```
❯ /unblock task-3 "use REST not gRPC — we don't have proto files set up"
```

### Check what's happening

```
❯ /status
```

Shows the current goal, status, progress bar, and wave number inline.

---

## 🔁 Background Jobs

For long-running goals, run detached and get a notification when done:

```bash
# Start detached — returns immediately
roland team "full refactor of the data access layer" --background

# Check on it later
roland bg-status

# Tail the log
roland bg-logs

# Or stream it live:
roland bg-logs --follow

# Stop it
roland bg-stop
```

Inside chat, the same commands work as slash commands:

```
❯ /bg-status
❯ /bg-logs
❯ /bg-stop
```

**Pair with notifications so you can do other things:**

```bash
roland team "long refactor" --background --notify --webhook https://ntfy.sh/my-topic
# → get a phone notification when complete or blocked
```

---

## 📊 Checking Status

### From chat
```
❯ /status        shows progress bar + task count inline
```

### From another terminal (live TUI)
```bash
roland status    # live updating TUI observer
```

### Web dashboard (richest view)
```bash
npm run serve-dashboard
# → http://127.0.0.1:8081
```

The dashboard shows:
- **Live run progress** — tasks, waves, blockers, in real time
- **HITL buttons** — Pause / Resume / Replan / Abort without touching the terminal
- **History** — every past run, searchable, expandable to full task list
- **Memory editor** — view and edit `.roland/memory.md` from the browser
- **Usage charts** — tokens, cost, model breakdown across all runs

```bash
# Point at a different project:
node scripts/serve-dashboard.js --state-dir /path/to/project/.roland --port 8082
```

---

## 🧠 Self-Improvement & Memory

Roland learns your project. After every run, it proposes updates to `.roland/memory.md` based on what it learned — patterns that worked, things to avoid, new gotchas discovered.

### The retrospective

After synthesis completes, you'll see a short interactive prompt listing proposed memory bullets. It **auto-accepts after 15 seconds** — just watch the countdown if you agree, or reject specific bullets.

```
  Self-Improvement
  Proposed 3 new memory bullets:
  + [Past Mistakes]  Never call token.verify() without catching TokenExpiredError
  + [Coding Standards]  Redis keys use prefix "auth:refresh:<userId>"
  + [Project Gotchas]  The test DB doesn't support transactions — use mocks

  Accept all in 12s… (press n to skip, e to edit)
```

### Disable it when you don't want it

```
❯ /improve off     turns off for the session

roland team "goal" --no-improve   one-time skip
```

### What's in memory

```bash
cat .roland/memory.md             # view directly
```

Or use the browser dashboard → **Memory** tab to read and edit it with syntax highlighting.

### Teaching Roland something immediately

Just mention it in your goal:

```
❯ note for the team: we use Zod for all input validation, never manual
  typeof checks — this is a hard standard
```

Or use the `/inject` command if a run is active.

---

## 🔀 Common Workflows

### New feature
```
❯ add a /health endpoint returning uptime, version, and memory usage
```
The team will architect it, implement it, write tests, review the code.

### Bug investigation
```
❯ POST /orders returns 422 for valid payloads — investigate root cause and fix,
  include a regression test
```

### Refactor
```
❯ refactor the database layer to use the repository pattern —
  no behaviour changes, all existing tests must still pass
```

### PR review
```bash
roland pr 42                  # structured critique
roland pr 42 --fix            # critique + implement fixes + commit
```

### Security audit
```
❯ audit the authentication flow for OWASP Top 10, JWT issues,
  and session management problems
```

### End-of-day review
```
❯ review today's changes — flag anything that should be cleaned up
  before tomorrow
```

### Iterating on a result

Use `/refine` after a run to follow up without starting a fresh chat:

```
❯ /refine "the executor missed the edge case where userId is null — fix that"
```

---

## 🏁 Typical Daily Flow

```
Morning
  └─  roland              open chat, leave it running all day

During the day
  ├─  ❯ implement the feature from ticket #847
  ├─  ❯ /status                  check progress mid-run
  ├─  ❯ /inject "use the v2 API not v1 — we deprecated v1 last week"
  ├─  ❯ /refine "fix the two failing tests the executor left behind"
  └─  roland pr 55 --fix         review open PR in a separate terminal

Background
  └─  roland team "..." --background --notify
      → phone notification when done, check dashboard later

End of day
  └─  ❯ review today's changes — anything to clean up?
```

---

## 🖥 Terminal Setup

### Single terminal (chat mode — simplest)

```bash
roland    # everything in one window
```

### Two-terminal setup

```
┌────────────────────────────┐  ┌────────────────────────────┐
│  Terminal 1                │  │  Terminal 2                │
│                            │  │                            │
│  roland                    │  │  roland status             │
│  ❯ implement the feature   │  │  (live TUI observer)       │
└────────────────────────────┘  └────────────────────────────┘
```

### SSH / Termius / Mobile

Roland auto-detects limited SSH environments and falls back to simple ASCII mode (no alternate-screen codes). If it doesn't detect correctly:

```bash
export ROLAND_SIMPLE_TUI=1     # add to shell profile — applies everywhere
```

Simple mode: `=` rules, ASCII progress bars, clean scrolling output on any terminal.

---

## 🚫 CI / Non-Interactive Mode

```bash
# Always use --no-tui in CI (no interactive terminal)
roland team "run the full review suite" --no-tui --quiet >> review.md

# Capture synthesis to a dated file
roland team "code review" --no-tui --quiet > review-$(date +%Y%m%d).md

# Pre-push hook (.git/hooks/pre-push)
#!/bin/sh
roland watch --once \
  --task "check staged changes for obvious issues" \
  --no-tui --quiet
```

---

## ⚙️ Resilience on Unstable Networks

Roland is built for unreliable connections. If you're on SSH, mobile, or an unstable link, these defaults protect you:

### What Roland does automatically

- **Staggered worker starts** — 1.5 s between agent launches (not 20 simultaneous TCP connections)
- **Circuit breaker** — pauses the run after the first wave of network errors, rather than wasting attempts
- **Smart retries** — network errors retry faster (2s, 5s, 10s…) than SDK errors (5s, 10s, 20s…)
- **Jitter** — all retry delays include ±30% random variance to prevent thundering herd

### When to override

```bash
# Fast, stable connection? Speed up:
ROLAND_MAX_CONCURRENT=4 roland "goal"

# Flaky SSH? Tolerate more errors:
ROLAND_CIRCUIT_BREAKER=3 roland "goal"

# Mobile/unstable? Fully sequential, maximum stability:
ROLAND_MAX_CONCURRENT=1 roland "goal"
```

All settings persist for one command. For permanent changes, export them in your shell profile.

---

## 🩺 Troubleshooting

### `CURSOR_API_KEY not set`

```bash
export CURSOR_API_KEY=your_key_here    # add to .zshrc / .bashrc / PowerShell $PROFILE
roland doctor                          # verify the full install
```

Inside chat, Roland shows a yellow warning in the welcome banner and refuses to run until the key is set.

### Garbled output on SSH / Termius (`^[[A[[A` garbage)

```bash
export ROLAND_SIMPLE_TUI=1    # permanent fix — add to shell profile
roland team "goal" --simple-tui   # or per-run
```

### Agent timeout — run stalls or never completes

```bash
ROLAND_AGENT_TIMEOUT_MS=900000 roland "goal"    # 15-minute timeout
ROLAND_AGENT_TIMEOUT_MS=60000  roland "goal"    # 1-minute (fast-fail testing)
```

### Network errors (ECONNRESET, socket hang up) — run pauses

This is the circuit breaker protecting you from burning through retries. Check what happened:

```bash
roland bg-logs    # see the error details
```

Then resume when the network is stable:

```bash
roland resume
```

Or increase error tolerance:

```bash
ROLAND_CIRCUIT_BREAKER=3 roland team "goal"    # tolerate up to 3 waves of errors
```

### Run shows blockers but no guidance on what to do

Check the synthesis — it has a 🔴 **Release Blockers** section with specifics. Then:

```
❯ /unblock task-3 "use the mocked DB client — we don't have real DB in CI"
```

Or start a refinement run:

```
❯ /refine "resolve the blockers from the last run"
```

### `roland status` shows "No run state found"

```bash
roland bg-status                                     # check background run
roland status --state-dir /path/to/.roland           # custom state dir
```

### Memory file looks wrong or corrupted

```bash
# View and edit in browser:
npm run serve-dashboard    # → http://127.0.0.1:8081  →  Memory tab

# Or edit directly — it's plain Markdown:
# ## Architecture Decisions
# - bullet
# ## Past Mistakes
# - bullet
```

### Notifications not firing

```bash
echo $ROLAND_NOTIFY              # should print 1 if set globally
roland "hello" --notify          # test explicitly
```

### Agents not found after an update

```bash
npm run build     # rebuilds dist/ and copies agents/ and recipes/
roland doctor     # confirms agents are present
```

---

## ⌨️ Quick Reference Card

| Action | Chat | CLI |
|--------|------|-----|
| Start a goal | type it | `roland "goal"` |
| Pause run | `/pause` | `roland pause` |
| Resume run | `/resume` | `roland resume` |
| Abort run | `/abort` | `roland abort` |
| Inject directive | `/inject "text"` | `roland inject "text"` |
| Unblock task | `/unblock <id> [msg]` | `roland unblock <id> [msg]` |
| Replan | `/replan` | `roland replan` |
| Check status | `/status` | `roland status` |
| Background status | `/bg-status` | `roland bg-status` |
| Tail bg logs | `/bg-logs` | `roland bg-logs` |
| Stop bg run | `/bg-stop` | `roland bg-stop` |
| Follow-up goal | `/refine "..."` | `roland "..."` |
| Toggle stream | `/stream` | `--stream` flag |
| Toggle notify | `/notify` | `--notify` flag |
| Full help | `/help` | `roland --help` |
| Quit | `/exit` or Ctrl+D | — |

