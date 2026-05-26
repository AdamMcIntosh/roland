# Onboarding — Roland PM Team

Welcome. Roland turns Cursor into a small AI engineering team **that you manage**.
You are the PM (on Claude Opus 4.7). Your engineers run on Cursor's Composer 2.5
models. You don't write code — you decompose work, delegate it, and keep the team
unblocked.

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

1. `get_pm_playbook` — adopt the PM posture.
2. `start_team_recipe { recipe: "full-feature-team", goal: "<your goal>" }`
3. For each returned dispatch, follow its **`cursorLaunch`** steps to spin up an
   engineer in a new Cursor pane (pick the recommended model, paste the brief).
4. `pm_standup` every turn. **Unblock first**, then review, then start new work.
5. `synthesize_deliverable` when the board is clear.

## The mindset

> **I am the PM. Roland runs the team. Keep them unblocked.**

A blocked or idle engineer is your single highest-priority problem — higher than
planning, higher than starting the next task. `pm_standup` always puts blockers
on top with the exact `unblock_task` call ready to fill in.

## Where state lives

Everything is per-project under `.roland/` (gitignored): the Blackboard, the
message bus, and `pm-events.log` (the audit timeline). The binary is installed
once, globally — it works in every project off a single `~/.cursor/mcp.json`
entry.

## Learn more

- **Full worked example:** `docs/guides/pm-workflow.md`
- **Install details & config:** `INSTALLATION.md`
- **Routing:** PM → `claude-opus-4-7`; reasoning roles (architect/reviewer/critic)
  → `composer-2.5-fast`; execution (executor/qa/docs) → `composer-2.5-standard`.
  Override in `config.yaml` under `pm:`.
