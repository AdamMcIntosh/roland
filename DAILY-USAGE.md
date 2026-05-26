# Roland — Daily Usage Cheat Sheet

> One page. Everything you need to use Roland every day.

---

## ⚡ The Essentials

```bash
# Run a team on any goal
roland "your goal here"

# See what's happening (second terminal)
roland status

# Check your install
roland doctor
```

---

## 🗂 Common Workflows

### 🟢 New Feature
```bash
roland "add a /health endpoint that returns uptime, version, and memory usage"
```
*The team will architect it, implement it, write tests, and review.*

### 🔵 Refactor
```bash
roland "refactor the payment service to use the Strategy pattern — no behaviour changes"
```
*Be explicit about what must NOT change. The team will respect that.*

### 🔴 Bug Investigation
```bash
roland "POST /orders returns 422 for valid payloads — find the root cause and fix it"
```
*Include the symptom, not just "fix the bug." More context = better diagnosis.*

### 🟡 PR Review
```bash
roland pr 42                    # review only — get a structured critique
roland pr 42 --fix              # review + implement fixes + commit
roland pr                       # auto-detect PR from current branch
```

### 🟣 Security Audit
```bash
roland "audit the authentication flow for security issues — OWASP Top 10, JWT, session management"
```

### 📝 Documentation
```bash
roland "write API documentation for all public routes in src/routes/ — OpenAPI 3.0 format"
```

### 🔁 Continuous Review (Background)
```bash
# Terminal 1 — runs a team session on every new git commit
roland watch

# Terminal 1 — fixed task on every commit (e.g. nightly review)
roland watch --task "review changes, flag issues, suggest improvements"

# Terminal 2 — watch it work
roland status
```

---

## 🏁 Flag Quick Reference

| Want to… | Flag |
|----------|------|
| Get a desktop notification | `--notify` |
| Get a phone notification (ntfy.sh) | `--webhook https://ntfy.sh/your-topic` |
| Use in CI / pipe output | `--no-tui --quiet` |
| See agent output as it streams | `--stream` |
| Watch file changes instead of git | `--pattern "src/**/*.ts"` |
| Run watch once and exit | `--once` |
| Create a fix branch for PR | `--branch fix/pr-42` |
| Change the state directory | `--state-dir /tmp/roland` |

---

## 🌍 Global Defaults (shell profile)

```bash
# ~/.zshrc  or  ~/.bashrc  or  PowerShell $PROFILE
export CURSOR_API_KEY=your_key_here
export ROLAND_NOTIFY=1          # desktop notification on every run
```

With `ROLAND_NOTIFY=1` set, you never need `--notify` again.

---

## 📱 Phone Notifications via ntfy.sh

```bash
# 1. Install the ntfy app (iOS / Android) — it's free
# 2. Subscribe to a unique topic name (e.g. roland-yourname)
# 3. Run:
roland watch --webhook https://ntfy.sh/roland-yourname
# Or add to your profile permanently:
export ROLAND_NOTIFY=1
# Then pass --webhook on any command
```

---

## 🔁 Typical Daily Workflow

```
Morning
  └─ roland watch   (leave running in a terminal — fires on each commit)

During the day
  ├─ roland "implement the feature from the ticket"
  ├─ roland pr 55 --fix          (review open PRs)
  └─ roland status               (check progress from another pane)

End of day
  └─ roland "review today's changes — anything to clean up before EOD?"
```

---

## 🧠 Project Memory

Roland learns your project over time. After every run, it updates `.roland/memory.md` with:
- Key decisions made
- Patterns to follow
- Things to avoid

**To see what it knows:**
```bash
cat .roland/memory.md
```

**To teach it something immediately:**
```bash
# Just run a goal that mentions it:
roland "note for the team: we use Zod for all input validation, never manual type checks"
```

**To reset memory** (new project context):
```bash
rm .roland/memory.md
```

---

## 🖥 Two-Terminal Setup (Recommended)

```
┌─────────────────────────────┐  ┌────────────────────────────┐
│  Terminal 1                 │  │  Terminal 2                │
│                             │  │                            │
│  roland "build the feature" │  │  roland status             │
│                             │  │                            │
│  (PM plans, agents run)     │  │  (live dashboard: wave     │
│                             │  │   progress, task status,   │
│                             │  │   agent activity)          │
└─────────────────────────────┘  └────────────────────────────┘
```

---

## 🚫 CI / Non-Interactive Mode

```bash
# In CI pipelines, always use --no-tui
roland team "run the full test suite and report" --no-tui --quiet

# Capture synthesis to a file
roland team "code review" --no-tui --quiet > review-$(date +%Y%m%d).md

# Pre-push hook (.git/hooks/pre-push)
#!/bin/sh
roland watch --once --task "check for obvious issues in staged changes" \
  --no-tui --quiet
```

---

## 💡 Pro Tips

1. **Specificity wins.** The more context in your goal, the better the plan. Include file names, function names, constraints, and what "done" looks like.

2. **Stack the flags you use most.** Put `ROLAND_NOTIFY=1` and your webhook URL in your shell profile and never think about it again.

3. **`roland pr` before you merge, not after.** Use it as a final quality gate — it often catches things that reviewers miss.

4. **Don't clear `.roland/` between runs** on the same project. The memory is the superpower. Clear it only when starting a genuinely new context.

5. **Use `--stream` when you want to follow along.** Great for long runs where you want to see results as each agent finishes.

6. **`roland pm-log` after a run** to see the PM's full reasoning trace — useful for understanding why the team made certain decisions.

---

## 🩺 Troubleshooting

```bash
roland doctor                   # full diagnostic
roland --help                   # flag reference
roland pm-log                   # PM reasoning timeline
cat .roland/memory.md           # what Roland knows about this project
```

**Agents not found?**
```bash
npm run build                   # rebuilds and copies agents/ and recipes/
roland doctor
```

**Notifications not firing?**
```bash
# Check ROLAND_NOTIFY is set
echo $ROLAND_NOTIFY             # should print 1
# Test with --notify explicitly
roland "hello" --notify
```
