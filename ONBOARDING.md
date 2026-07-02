# Onboarding — Roland in Cursor

Welcome. Roland turns Cursor into an AI engineering supervisor with **Hermes (Master Chief)** as the primary conversational layer and **CLI** as the monitoring source of truth.

| Surface | Role |
|---------|------|
| **Hermes / Master Chief** | Primary PM — `roland chat`, Cursor `@roland`, MCP monitoring |
| **Roland CLI** | **Status & control** — `roland status`, `roland live`, `roland hitl-status`, `roland board-status` |
| **Roland ClosedLoop** | Loop execution — `roland team "…" --loop-template …` |
| **Dashboard** | **Optional / deprecated** — live loop panels only when CLI is inconvenient |

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

## Your first session

1. **Plan & converse** — Hermes (`roland chat`) or Cursor `@roland` (triage runs automatically).
2. **Launch** — `roland team "goal" --loop-template full-cycle-verified-loop`
3. **Monitor** — CLI (preferred):

```bash
roland status              # one-shot snapshot (board + HITL + supervisor)
roland live                # continuous refresh every 5s
roland hitl-status         # HITL gates and suggested actions
roland board-status --concise
roland mission-summary     # after terminal state
```

4. **Optional dashboard** (phone/Tailscale only):

```bash
npm run serve-dashboard    # http://127.0.0.1:8081 — monitor/control adjunct only
```

## The mindset

> **Hermes plans. Roland ClosedLoop executes. CLI shows the battlespace. Keep blockers cleared.**

Prefer **Pure ClosedLoop** (default) — `use_pm_team: false`.

## Where state lives

Per-project under `.roland/` (gitignored): Blackboard, loop memory, `pm-events.log`, `hermes-hitl-events.jsonl`.

## Learn more

- **Closed-loop harness:** `docs/guides/closed-loop-harness.md`
- **Hermes skill:** `.hermes/SKILL.md`
- **Install:** `INSTALLATION.md`
