# Roland: Multi-Model Orchestration for Cursor — With Budget Control and Team Missions

Roland is a TypeScript MCP server for Cursor and VS Code. It routes each task to the best model for the job, tracks spending, drives multi-agent recipe workflows, and runs Pure ClosedLoop team missions — without locking you into a single AI provider.

## What it does

When Roland is connected via MCP in Cursor:

- **Smart model routing** — complexity classifier + model router pick the cheapest model that can handle each task.
- **Hard budget caps** — set a monthly limit. At 80%, Roland automatically switches agents to free models so you never overshoot.
- **Multi-agent recipe workflows** — drive structured pipelines (Plan → Execute → Review → Explain, BugFix, SecurityAudit, and more) via MCP `start_recipe` / `advance_recipe`.
- **Pure ClosedLoop team missions** — `roland team "goal"` spawns parallel callsigns (Sparrow, Vanguard, Oracle, Sentinel) with verification gates.
- **Git awareness** — `git_status`, `git_diff`, `git_log`, `git_commit` MCP tools give agents native git understanding.
- **Screenshot analysis** — `analyze_screenshot` captures your screen and sends it to a vision model.
- **Persistent project context** — `roland-context.json` stores migration rules, architecture decisions, and test patterns across sessions.
- **Inline diff UI** — the `roland-diff` VS Code extension shows proposed changes in VS Code's native side-by-side diff viewer with Apply/Discard buttons.

## Install

See [INSTALLATION.md](../INSTALLATION.md) for full setup. Quick path:

```bash
curl -fsSL https://raw.githubusercontent.com/AdamMcIntosh/roland/main/scripts/setup.sh | bash
```

Or manually: clone, `npm install && npm run build`, `npm run init -- /path/to/project`, configure Cursor MCP.

## Quick start

### Cursor chat

```
Use the health_check tool
Use the triage tool with message "Fix the null check on line 42 of auth.ts"
```

### Team mission

```bash
roland team "Add rate limiting to the API" --loop-template full-cycle-verified-loop
```

## Links

- [GitHub](https://github.com/AdamMcIntosh/roland)
- [Installation guide](../INSTALLATION.md)
- [Recipe catalog](../RECIPES_CATALOG.md)
- [Roadmap](../ROADMAP.md)
- [Issues & feature requests](https://github.com/AdamMcIntosh/roland/issues)
- [Beta program](beta-testers.md)
