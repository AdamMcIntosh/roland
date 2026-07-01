# Onboarding — Hermes + Roland Hybrid

Welcome. Roland is a **hybrid agent platform**:

| Layer | Role |
|-------|------|
| **Hermes** | Primary PM / strategist — plan missions, triage work, trigger loops (`roland chat`, Cursor `@roland`, `roland team`) |
| **Roland** | Loop execution engine — PACVRE closed-loop harness, verification gates, specialist spawns |

You converse with **Hermes** to plan work. **Roland** runs structured loop iterations when you attach a template.

> [DEPRECATED] The legacy in-loop **PM Team** persona (LeadPM, `use_pm_team: true`) remains for backward compatibility only. Hermes is the recommended PM layer.

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

You should see ✅ for the binary, personas, team recipes, the Cursor MCP entry,
and a writable `.roland/`.

## Your first session

In any project, in Cursor chat:

1. Mention `@roland` or run `roland chat` — **Hermes** greets you and triages work.
2. For a multi-step goal: `roland team "your goal" --loop-template full-cycle-verified-loop`
3. Monitor progress: `npm run serve-dashboard` → http://127.0.0.1:8081
4. `roland board-status --concise` for battlespace summary.

For legacy board-driven PM workflows (advanced):

1. `get_pm_playbook` — adopt the [DEPRECATED] legacy PM posture.
2. `start_team_recipe { recipe: "full-feature-team", goal: "<your goal>" }`
3. `pm_standup` every turn. **Unblock first**, then review, then start new work.

## The mindset

> **Hermes plans. Roland executes loops. Keep blockers cleared.**

For loop missions, prefer **Pure ClosedLoop** (default) — Hermes handles PM scope; Roland runs PACVRE iterations.

## Where state lives

Everything is per-project under `.roland/` (gitignored): the Blackboard, the
message bus, loop memory, and `pm-events.log` (the audit timeline). The binary is installed
once, globally — it works in every project off a single `~/.cursor/mcp.json`
entry.

## Learn more

- **Closed-loop harness:** `docs/guides/closed-loop-harness.md`
- **Legacy PM workflow:** `docs/guides/pm-workflow.md` ([DEPRECATED] — prefer Hermes)
- **Install details & config:** `INSTALLATION.md`
- **Routing:** Models configured in `config.yaml` under `models:` — routed automatically by ModelRouter.
