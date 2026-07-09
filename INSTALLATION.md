# Installation Guide — Roland MCP Server

Setup guide for Roland as an MCP server integrated with VS Code or Cursor.

> **Start here:** [README.md](README.md) — quick start, CLI reference, Direct vs Team decision guide, and architecture summary.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Installation Steps](#installation-steps)
3. [Cursor Setup](#cursor-setup)
4. [VS Code Setup](#vs-code-setup)
5. [Use on Any Project](#use-on-any-project)
6. [Available MCP Tools](#available-mcp-tools)
7. [Verify Installation](#verify-installation)
8. [Troubleshooting](#troubleshooting)
9. [Development](#development)

## Prerequisites

- **Node.js**: v22.0.0 or higher (see `package.json` engines)
- **npm**: v9.0.0 or higher
- **IDE**: Cursor (primary) or VS Code (with GitHub Copilot)
- **Cursor API key** (required for missions): [cursor.com/settings](https://cursor.com/settings) → API Keys — `roland team` / `roland mission` cannot run without it
- **OpenRouter API key** (optional): [openrouter.ai](https://openrouter.ai/) — for cost tracking and model routing metadata

## Installation Steps

### Option A: One-Command Setup (Recommended)

**Bash** (macOS / Linux / Git Bash on Windows):
```bash
curl -fsSL https://raw.githubusercontent.com/AdamMcIntosh/roland/main/scripts/setup.sh | bash
```

**PowerShell** (Windows):
```powershell
irm https://raw.githubusercontent.com/AdamMcIntosh/roland/main/scripts/setup.ps1 | iex
```

This single command will:
1. Check your environment (Node.js version)
2. Prompt for your **Cursor API key** (required for missions) and save it to `~/.roland/.env`
3. Prompt for an optional OpenRouter API key (cost tracking) and save it to `~/.roland/config.yaml`
4. Clone Roland into `~/.roland/roland/` (or update if already cloned)
5. Build Roland (`npm install && npm run build`)
6. Initialize the current directory with agent configs and MCP settings

### Option B: Manual Setup

<details>
<summary>Click to expand manual setup steps</summary>

#### 1. Clone & Install

```bash
git clone https://github.com/AdamMcIntosh/roland.git
cd roland
npm install
```

#### 2. Build

```bash
npm run build
```

#### 3. First-run setup (API key)

```bash
node dist/index.js init    # or `roland init` after global install
```

</details>

## Global CLI + First-Run Setup (`roland init`)

To install the `roland` binary globally and merge the MCP entry into `~/.cursor/mcp.json`:

```bash
bash scripts/install-global.sh      # Windows: pwsh scripts/install-global.ps1
roland init                          # interactive: CURSOR_API_KEY, GitHub token, MCP, telemetry
roland doctor                        # verify: API key, binary, personas, recipes, Cursor entry, .roland write
```

`roland init` walks you through first-run setup and writes your keys to
`~/.roland/.env`, which Roland loads automatically on every run. **Missions
(`roland team` / `roland mission`) fail without `CURSOR_API_KEY`** — if
`roland doctor` reports it missing, run `roland init` again.

Restart Cursor after the install so it picks up the MCP entry. See
**[`ONBOARDING.md`](ONBOARDING.md)** for the full first-session walkthrough.

Prefer to wire it by hand instead? Use the manual options below.

## Cursor Setup

### Option A: Global Config (Recommended — configure once, works in every project)

Create or edit `~/.cursor/mcp.json` (i.e. `C:\Users\<you>\.cursor\mcp.json`):

```jsonc
{
  "mcpServers": {
    "roland": {
      "command": "node",
      "args": ["C:/path/to/roland/dist/index.js"]
    }
  }
}
```

Replace `C:/path/to/roland` with the actual path to your roland clone. Restart Cursor, and `roland` will appear in **Settings → MCP** for every project you open.

### Option B: Per-Project Config (via init command)

From the roland directory:

```bash
npm run init -- C:\path\to\your\project
```

This generates `.cursor/mcp.json` (with absolute path), agent personas in `.cursor/rules/`, and agent files in `.github/agents/` in the target project.

### Option C: Roland Project Only

If you just want to test within the roland repo itself, the existing `.cursor/mcp.json` uses a relative path and works out of the box:

```jsonc
{
  "mcpServers": {
    "roland": {
      "command": "node",
      "args": ["dist/index.js"]
    }
  }
}
```

### Verify in Cursor

1. Open **Settings → MCP** — `roland` should show a green status
2. Open chat and type: *"Use the health_check tool"*
3. You should get `status: healthy` and a list of 20 tools

If the server shows red, rebuild (`npm run build` in the roland directory) and click **Restart** next to roland in Settings → MCP.

## VS Code Setup

### Option A: Per-Project Config (via init command)

```bash
cd /path/to/roland
npm run init -- C:\path\to\your\project
```

This generates `.vscode/mcp.json` with an absolute path to roland.

### Option B: Roland Project Only

The included `.vscode/mcp.json` uses the workspace-relative path:

```jsonc
{
  "servers": {
    "roland": {
      "type": "stdio",
      "command": "node",
      "args": ["${workspaceFolder}/dist/index.js"]
    }
  }
}
```

Verify by opening the Command Palette → **MCP: List Servers**.

## Use on Any Project

Roland is fully portable. The `init` command exports everything a project needs:

```bash
cd /path/to/roland
npm run init -- /path/to/your/project
```

### What Gets Created

| Path | Contents |
|------|----------|
| `.cursor/mcp.json` | Cursor MCP config (absolute path to Roland) |
| `.cursor/rules/*.mdc` | Cursor agent persona rules |
| `.vscode/mcp.json` | VS Code MCP config (absolute path to Roland) |
| `.github/agents/*.agent.md` | VS Code Copilot agent personas |
| `.github/copilot-instructions.md` | Agent catalog & usage guide |
| `.roland/project-context.json` | Cross-session knowledge base (conventions, patterns, decisions) |
| `.roland/model-quality.json` | Model A/B quality tracking data |
| `roland-context.json` | Structured project context (rules, decisions, test patterns) |
| `MIGRATION.md` | Human-readable companion to roland-context.json |

If you use the **global Cursor config** (Option A above), you only need `init` when you want the agent persona files — the MCP server is already available everywhere.

### Using Agents

After setup, mention agents by name in chat:

- `@architect` — System design & architecture
- `@executor` — Implementation & coding
- `@planner` — Task breakdown
- `@critic` — Code review & validation

Start a recipe workflow by invoking the first agent in the chain:

- `@plan-exec-rev-ex-planner` — 4-agent autonomous coding loop
- `@bugfix-analyst` — Full bug resolution workflow
- `@securityaudit-architect` — Security audit workflow

See `.github/copilot-instructions.md` for the full list.

## Available MCP Tools

Once connected, the Roland MCP server provides:

| Tool | Purpose |
|------|---------|
| `health_check` | Server status & uptime |
| `triage` | Analyze task → recommend agent, model, recipe |
| `route_model` | Complexity analysis → cheapest suitable model |
| `track_cost` | Log token usage, return session totals |
| `manage_budget` | Get/set/reset spending limits |
| `get_analytics` | Cost breakdowns by model/agent/provider |
| `suggest_mode` | Recommend quick/standard/deep depth |
| `list_recipes` | Browse available workflow recipes |
| `start_recipe` | Start a multi-agent recipe, get first step prompt |
| `advance_recipe` | Advance recipe to next step or get summary |
| `session_context` | Persistent memory for long sessions — tracks decisions, files, patterns |
| `preview_changes` | Generate unified diff + HTML preview of file changes |
| `load_migration_context` | Load roland-context.json project context into session |
| `update_migration_context` | Append rules, decisions, patterns to project context |
| `git_status` | Current git status — staged, unstaged, untracked |
| `git_diff` | Unified diff of working tree or staged changes |
| `git_log` | Last N commits (oneline format) |
| `git_commit` | Stage files and create a commit |
| `analyze_screenshot` | Capture screen or load image, analyze with vision model |
| `project_context` | Cross-session knowledge base — observe conventions, patterns, decisions, errors |
| `quality_signal` | Record model quality feedback (accept/retry/reject) for adaptive routing |

No API key is required for the MCP tools themselves. All tools run locally. The IDE's own model handles execution.

## Verify Installation

### Quick Test

1. Build: `npm run build`
2. Open any project in Cursor (with global config) or a project where you ran `init`
3. Go to **Settings → MCP** and verify `roland` shows a green status
4. Open Cursor chat and ask: *"Use the health_check tool"*
5. You should get a response with `status: healthy` and a list of available tools

See [TESTING.md](TESTING.md) for a full testing walkthrough.

## Team Missions (ClosedLoop)

For multi-step autonomous work, use Pure ClosedLoop team missions from the CLI:

```bash
roland team "Refactor the auth module to use JWT tokens" --loop-template full-cycle-verified-loop
```

Templates: `full-cycle-verified-loop` (default) · `feature-implementation-loop` · `refactor-and-modernize-loop` · `research-and-spec-loop`

In Cursor chat, `@roland` triage routes Direct vs Team automatically. Team path spawns parallel callsigns (Sparrow, Vanguard, Oracle, Sentinel) with verification gates.

### Init a Project (Recommended)

Run `roland init` in your project directory to scaffold everything:

```bash
cd /path/to/roland
npm run init -- /path/to/your/project
```

What gets created in your project:

| File | Purpose |
|------|---------|
| `.cursor/mcp.json` | Cursor MCP config |
| `.roland/project-context.json` | Cross-session knowledge base |
| `roland-context.json` | Structured project context |
| `.github/agents/*.agent.md` | Agent personas |

`load_migration_context` at session start gives the agent your project context when invoked via MCP.

## VS Code Extension (Inline Diffs)

The `roland-diff` extension provides inline accept/reject diffs using VS Code's native diff viewer.

### Install

```bash
cd /path/to/roland/extension
npm install
npm run compile
```

Then in VS Code: **Extensions → ... → Install from VSIX** (or use `code --install-extension roland-diff-0.1.0.vsix` after packaging with `npm run package`).

For development, open the `extension/` folder in VS Code and press **F5** to launch the Extension Development Host.

### How it works

1. Roland's `preview_changes` tool writes proposed changes to `.omc/pending-changes/`
2. The extension watches that directory and opens VS Code's native side-by-side diff
3. **Apply** (checkmark) writes the proposed content to the original file
4. **Discard** (trash) deletes the pending change
5. Status bar shows the count of pending changes — click to browse

### Commands

| Command | Description |
|---------|-------------|
| `Roland: Apply Change` | Apply the current diff to the original file |
| `Roland: Discard Change` | Discard the current proposed change |
| `Roland: Apply All Pending Changes` | Bulk apply all pending changes |
| `Roland: Discard All Pending Changes` | Bulk discard all pending changes |
| `Roland: Show Pending Changes` | Quick picker to browse all pending diffs |

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `CURSOR_API_KEY is not set` when running a mission | Run `roland init` (saves to `~/.roland/.env`), then `roland doctor` to confirm |
| Server not showing in Settings → MCP | Check your `mcp.json` path is correct, rebuild (`npm run build`), restart Cursor |
| `Cannot find module 'dist/index.js'` | Run `npm run build` in the roland directory |
| Server shows red status | Click **Restart** in Settings → MCP |
| Tools not appearing in chat | Verify server is green in Settings → MCP, try restarting Cursor |
| TypeScript compilation errors | `node --version` (need v18+), then `rm -rf node_modules && npm install && npm run build` |
| Works in roland project but not others | You're using a relative path — switch to global config or run `npm run init` |

## Development

```bash
npm run dev            # Watch mode (auto-rebuild)
npm run build          # Full build
npm run init           # Set up Roland in current directory
npm run init -- <dir>  # Set up Roland in target directory
npm run export-configs # Regenerate IDE configs (roland project only)
npm test               # Run tests
npm run lint           # Lint check
npm run clean          # Remove dist/
```

## Next Steps

1. **Quick setup**: `curl -fsSL https://raw.githubusercontent.com/AdamMcIntosh/roland/main/scripts/setup.sh | bash` — handles clone, build, API key, and project init in one command
2. **Set your budget**: Ask the agent to use `manage_budget` with `set_limit`
3. **Run a team mission**: `roland team "Add user settings page" --loop-template feature-implementation-loop`
4. **Monitor costs**: `get_analytics` — see where tokens and money are going, including model quality data
5. **Build project knowledge**: Use `project_context` with `observe` to record conventions and patterns — they'll persist across sessions
