# Onboarding — Roland in Cursor

Welcome. Roland is a **production-grade closed-loop agent harness** for Cursor. The default workflow is **@roland in Cursor** (MCP triage) → **Direct** (small fixes in chat) or **Pure ClosedLoop** (`roland mission` with loop templates).

| Surface | Role |
|---------|------|
| **@roland (Cursor MCP)** | Primary entry — triage, direct edits, team launch |
| **Roland CLI** | Status & control — `roland status`, `roland live`, `roland hitl-status`, `roland board-status` |
| **Roland ClosedLoop** | Loop execution — `roland mission "…" --loop-template …` |
| **Dashboard** | Optional adjunct — monitor/control when CLI is inconvenient (`npm run serve-dashboard`) |

> **Hermes** (`roland chat`) is optional for terminal-only workflows — **not required in Cursor**.

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
roland --version    # expect 1.6.0
```

## Your first session

1. **Plan in Cursor** — `@roland` (triage runs automatically on new work).
2. **Launch a loop** — when triage recommends Team:

```bash
roland mission "add rate limiting to the password reset endpoint" \
  --loop-template full-cycle-verified-loop
```

3. **Monitor** — CLI (preferred):

```bash
roland status
roland live
roland hitl-status
roland board-status --concise
roland mission-summary
roland mission-audit --last
```

4. **Optional dashboard** (phone/Tailscale):

```bash
npm run serve-dashboard    # http://127.0.0.1:8081
```

## Architecture (v1.6.0)

```
  @roland (Cursor) ──triage──► Direct (chat) | Team (CLI)
                                    │
                                    ▼
                         roland mission + loop template
                                    │
                                    ▼
                    ClosedLoop: Plan → Act → Verify → Critique
                                    │
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
            EvaluationGate   loop-metrics.json   blackboard.json
```

| Component | What it does |
|-----------|--------------|
| **ClosedLoop hot path** | `loop-engine` — Plan → Act → Verify → Critique → Retry |
| **EvaluationGate** | Automated lint/unit/typecheck gates with confidence scoring |
| **PhaseIntentPoster** | Posts phase intents to blackboard (does **not** spawn sub-agents on hot path) |
| **Critique phase** | Rule-based structured critique (**no LLM**) — retry/escalate decisions |
| **LoopObservability** | Phase timing in `.roland/loop-metrics.json`; surfaced in `mission-audit` |
| **Coordination store** | Single locked blackboard at `.roland/blackboard.json` |
| **MCP server** | Modular tools under `src/server/tools/` |

## The mindset

> **Triage first. Direct for small fixes. Pure ClosedLoop for missions. CLI shows the battlespace.**

## Where state lives

Per-project under `.roland/` (gitignored):

- `blackboard.json` — locked coordination store (tasks, decisions, loop posts)
- `command-blackboard.md` — human-readable mission summary
- `loop-state.json` — active loop iteration state
- `loop-metrics.json` — phase timing and success rates
- `loop-memory.json` — reflection / confidence history
- `hermes-hitl-events.jsonl` — HITL escalation events
- `usage-history.json` — per-run cost/token estimates
- `missions/<id>/` — archived blackboard/audit from prior runs

## Cost & budget

Mission cost is estimated per run and printed in the **Mission Complete** footer. Configure ceilings in `config.yaml`:

```yaml
budget:
  mission_budget_usd: 5.00
  daily_budget_usd: 25.00
  estimated_per_iteration_cost_usd: 0.75
  enforce_hard_ceiling: true
```

CLI override: `roland team "goal" --budget 2.50`

## State hygiene

- Each new mission archives prior blackboard/audit into `.roland/missions/<id>/`
- `roland team "goal" --clean` — full archive + loop artifact reset (preserves `memory.md` and `usage-history.json`)
- Add `.roland/` and `.roland-sim/` to `.gitignore` (`roland init` does this automatically)

## Troubleshooting

See **[docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)** — mission stalls, HITL blockers, connection drops, verification loops, stale state.

## Learn more

- **Closed-loop harness:** [docs/guides/closed-loop-harness.md](docs/guides/closed-loop-harness.md)
- **Model routing & cost:** [docs/guides/model-routing-and-cost.md](docs/guides/model-routing-and-cost.md)
- **Full README:** [README.md](README.md)
- **Install:** [INSTALLATION.md](INSTALLATION.md)
