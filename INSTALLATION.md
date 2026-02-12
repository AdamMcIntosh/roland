# Installation Guide — Samwise MCP Server

Setup guide for Samwise as an MCP server integrated with VS Code or Cursor.

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

- **Node.js**: v18.0.0 or higher
- **npm**: v9.0.0 or higher
- **IDE**: Cursor (primary) or VS Code (with GitHub Copilot)

## Installation Steps

### 1. Clone & Install

```bash
git clone https://github.com/yourusername/samwise.git
cd samwise
npm install
```

### 2. Build

```bash
npm run build
```

## Cursor Setup

### Option A: Global Config (Recommended — configure once, works in every project)

Create or edit `~/.cursor/mcp.json` (i.e. `C:\Users\<you>\.cursor\mcp.json`):

```jsonc
{
  "mcpServers": {
    "samwise": {
      "command": "node",
      "args": ["C:/path/to/samwise/dist/index.js"]
    }
  }
}
```

Replace `C:/path/to/samwise` with the actual path to your samwise clone. Restart Cursor, and `samwise` will appear in **Settings → MCP** for every project you open.

### Option B: Per-Project Config (via init command)

From the samwise directory:

```bash
npm run init -- C:\path\to\your\project
```

This generates `.cursor/mcp.json` (with absolute path), agent personas in `.cursor/rules/`, and agent files in `.github/agents/` in the target project.

### Option C: Samwise Project Only

If you just want to test within the samwise repo itself, the existing `.cursor/mcp.json` uses a relative path and works out of the box:

```jsonc
{
  "mcpServers": {
    "samwise": {
      "command": "node",
      "args": ["dist/index.js"]
    }
  }
}
```

### Verify in Cursor

1. Open **Settings → MCP** — `samwise` should show a green status
2. Open chat and type: *"Use the health_check tool"*
3. You should get `status: healthy` and a list of 9 tools

If the server shows red, rebuild (`npm run build` in the samwise directory) and click **Restart** next to samwise in Settings → MCP.

## VS Code Setup

### Option A: Per-Project Config (via init command)

```bash
cd /path/to/samwise
npm run init -- C:\path\to\your\project
```

This generates `.vscode/mcp.json` with an absolute path to samwise.

### Option B: Samwise Project Only

The included `.vscode/mcp.json` uses the workspace-relative path:

```jsonc
{
  "servers": {
    "samwise": {
      "type": "stdio",
      "command": "node",
      "args": ["${workspaceFolder}/dist/index.js"]
    }
  }
}
```

Verify by opening the Command Palette → **MCP: List Servers**.

## Use on Any Project

Samwise is fully portable. The `init` command exports everything a project needs:

```bash
cd /path/to/samwise
npm run init -- /path/to/your/project
```

### What Gets Created

| Path | Contents |
|------|----------|
| `.cursor/mcp.json` | Cursor MCP config (absolute path to Samwise) |
| `.cursor/rules/*.mdc` | Cursor agent persona rules |
| `.vscode/mcp.json` | VS Code MCP config (absolute path to Samwise) |
| `.github/agents/*.agent.md` | VS Code Copilot agent personas |
| `.github/copilot-instructions.md` | Agent catalog & usage guide |

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

Once connected, the Samwise MCP server provides:

| Tool | Purpose |
|------|---------|
| `health_check` | Server status & uptime |
| `route_model` | Analyze complexity → recommend cheapest model |
| `track_cost` | Log token usage, return session totals |
| `manage_budget` | Get/set/reset spending limits |
| `get_analytics` | Cost breakdowns by model/agent/provider |
| `suggest_mode` | Recommend quick/standard/deep depth |
| `list_recipes` | Browse available workflow recipes |
| `start_recipe` | Start a multi-agent recipe, get first step prompt |
| `advance_recipe` | Advance recipe to next step or get summary |

No API key is required for the MCP tools themselves. All tools run locally. The IDE's own model handles execution.

## Verify Installation

### Quick Test

1. Build: `npm run build`
2. Open any project in Cursor (with global config) or a project where you ran `init`
3. Go to **Settings → MCP** and verify `samwise` shows a green status
4. Open Cursor chat and ask: *"Use the health_check tool"*
5. You should get a response with `status: healthy` and a list of 9 tools

See [TESTING.md](TESTING.md) for a full testing walkthrough.

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Server not showing in Settings → MCP | Check your `mcp.json` path is correct, rebuild (`npm run build`), restart Cursor |
| `Cannot find module 'dist/index.js'` | Run `npm run build` in the samwise directory |
| Server shows red status | Click **Restart** in Settings → MCP |
| Tools not appearing in chat | Verify server is green in Settings → MCP, try restarting Cursor |
| TypeScript compilation errors | `node --version` (need v18+), then `rm -rf node_modules && npm install && npm run build` |
| Works in samwise project but not others | You're using a relative path — switch to global config or run `npm run init` |

## Development

```bash
npm run dev            # Watch mode (auto-rebuild)
npm run build          # Full build
npm run init           # Set up Samwise in current directory
npm run init -- <dir>  # Set up Samwise in target directory
npm run export-configs # Regenerate IDE configs (samwise project only)
npm test               # Run tests
npm run lint           # Lint check
npm run clean          # Remove dist/
```

## Next Steps

1. **Read the agent catalog**: See `.github/copilot-instructions.md`
2. **Try a recipe**: Invoke `@plan-exec-rev-ex-planner` with a coding task
3. **Monitor costs**: Ask the agent to use `get_analytics`
4. **Set a budget**: Ask the agent to use `manage_budget` with `set_limit`
5. **Test recipes**: See [TESTING.md](TESTING.md)
