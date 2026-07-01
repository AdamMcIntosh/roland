# Onboarding — Roland in Cursor

Welcome. Roland turns Cursor into an AI engineering supervisor with **no separate Hermes layer required**.

| Surface | Role |
|---------|------|
| **@roland in Cursor** | PM, triage, direct edits — MCP (`triage`, `roland_run_team`, `pm_standup`) |
| **Roland ClosedLoop** | Loop execution — `roland team "…" --loop-template …` |
| **Dashboard** | Monitor & control active loops (`npm run serve-dashboard`) |

> **Hermes** (`roland chat` CLI) is optional for terminal-only workflows outside Cursor.

## 60-second setup

```bash
git clone https://github.com/AdamMcIntosh/roland.git
cd roland
bash scripts/install-global.sh    # build + global install + merge ~/.cursor/mcp.json
# Windows: pwsh scripts/install-global.ps1
```

Restart Cursor. Verify with:

```bash
roland doctor
```

## Your first session (Cursor)

1. Mention `@roland` in chat — triage runs automatically.
2. Small task → handled directly in chat.
3. Multi-step goal → `roland team "goal" --loop-template full-cycle-verified-loop` or confirm `roland_run_team`.
4. Monitor: `npm run serve-dashboard` → http://127.0.0.1:8081

## The mindset

> **@roland triages and plans. Roland ClosedLoop executes loops. Keep blockers cleared.**

Prefer **Pure ClosedLoop** (default) — `use_pm_team: false`.

## Where state lives

Per-project under `.roland/` (gitignored): Blackboard, loop memory, `pm-events.log`.

## Learn more

- **Closed-loop harness:** `docs/guides/closed-loop-harness.md`
- **Install:** `INSTALLATION.md`
