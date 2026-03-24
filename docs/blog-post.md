# Roland: A Multi-Model Coding Agent — With Model Choice and Budget Control

Roland is a TypeScript MCP server that pairs with [Goose](https://block.github.io/goose/) to give you a full autonomous coding agent. It routes each task to the best model for the job, tracks your spending, and drives multi-agent recipe workflows — all without locking you into a single AI provider.

## What it does

When you run Goose with Roland loaded, you get:

- **Autonomous file editing and shell execution** — Goose's Developer extension reads/writes files and runs commands. Roland decides which model handles each step.
- **Smart model routing** — complexity classifier + model router pick the cheapest model that can handle each task. Simple fixes go to Gemini Flash ($0.01). Complex architecture goes to Claude Sonnet ($0.15). You never overpay.
- **Hard budget caps** — set a daily or monthly limit. At 80%, Roland automatically switches all agents to free models so you never overshoot.
- **Multi-agent recipe workflows** — drive structured pipelines (Plan → Execute → Review → Explain, BugFix, SecurityAudit, VB6Migration, and more) end-to-end. Each step runs on the right model.
- **Git awareness** — `git_status`, `git_diff`, `git_log`, `git_commit` MCP tools give agents native git understanding.
- **Screenshot analysis** — `analyze_screenshot` captures your screen and sends it to a vision model. Useful for debugging UI issues or reading error dialogs.
- **Persistent project context** — `roland-context.json` stores migration rules, architecture decisions, and test patterns across sessions.
- **Permission policy** — `.roland-permissions.json` controls what Goose sessions can do: restrict shell access, deny specific commands, limit write paths. Run in Docker for process-level isolation.
- **Inline diff UI** — the `roland-diff` VS Code extension shows proposed changes in VS Code's native side-by-side diff viewer with Apply/Discard buttons.

## How it compares to Claude Code

| Capability | Roland + Goose | Claude Code |
|---|---|---|
| File read/write | ✅ Goose Developer ext | ✅ Native |
| Shell execution | ✅ Goose Developer ext | ✅ Native |
| Git awareness | ✅ 4 MCP tools | ✅ Native |
| Session memory | ✅ SessionContextManager | ✅ Conversation history |
| Screenshot/vision | ✅ OpenRouter vision models | ✅ Native |
| Permission gating | ✅ Docker container isolation + policy | ✅ Per-tool approval |
| Inline diff UI | ✅ VS Code extension (`roland-diff`) | ✅ Native |
| Model choice | ✅ Any OpenRouter model | ❌ Claude only |
| Cost visibility | ✅ Full tracking + hard caps | ❌ None |
| Budget enforcement | ✅ Daily/monthly caps | ❌ None |
| Multi-provider recipes | ✅ Claude plans, Gemini reviews | ❌ Single provider |
| CI/headless runs | ✅ Runs anywhere Goose runs | ❌ IDE-bound |

**Multi-model routing and budget control that Claude Code doesn't have.** Roland covers the core coding agent capabilities — file editing, shell execution, git, vision, diffs, permissions — through Goose, while adding cost visibility, model flexibility, and multi-agent recipes on top.

## Install

### Prerequisites

- [Goose](https://block.github.io/goose/) installed
- [OpenRouter](https://openrouter.ai/) account + API key
- Node.js 18+

### 1. Clone and build

```bash
git clone https://github.com/AdamMcIntosh/roland.git
cd roland
npm install && npm run build
```

### 2. Init your project

```bash
npm run init -- /path/to/your/project
```

This scaffolds `.goose/config.yaml`, `.roland-permissions.json`, `roland-context.json`, and IDE MCP configs in your project.

### 3. Set your API key and start Goose

```bash
export OPENROUTER_API_KEY=sk-or-...
cd /path/to/your/project
goose session
```

Roland loads automatically via `.goose/config.yaml`. Call `health_check` to verify.

### 4. Set a budget

```
> Use manage_budget with action "set_limit" and daily_limit 2.50
```

That's ~$85/month. Roland degrades to free models at 80% — you never overshoot.

## Quick start

### Interactive session

```
> Design an auth system with JWT and refresh tokens
```
Roland triages as complex → routes to Claude Sonnet → returns architecture design. Cost: ~$0.10.

```
> Fix the null check on line 42 of auth.ts
```
Roland triages as simple → routes to Gemini Flash → Goose edits the file directly. Cost: ~$0.01.

### Autonomous recipe run

```bash
# Plan → Execute → Review → Explain, fully autonomous
npx tsx scripts/run-recipe.ts \
  --recipe PlanExecRevEx \
  --task "Add rate limiting to the API" \
  --project /path/to/project

# Multi-file bug fix
npx tsx scripts/run-recipe.ts \
  --recipe BugFix \
  --task "Fix the login timeout race condition"

# Preview prompts without executing
npx tsx scripts/run-recipe.ts \
  --recipe SecurityAudit \
  --task "Audit the payment module" \
  --dry-run
```

## Links

- [GitHub](https://github.com/AdamMcIntosh/roland)
- [Installation guide](../INSTALLATION.md)
- [Goose user guide](guides/goose-user-guide.md)
- [Recipe catalog](../RECIPES_CATALOG.md)
- [Roadmap](../ROADMAP.md)
- [Issues & feature requests](https://github.com/AdamMcIntosh/roland/issues)
- [Beta program](beta-testers.md)
