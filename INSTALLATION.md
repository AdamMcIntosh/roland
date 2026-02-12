# Installation Guide — Samwise MCP Server

Setup guide for Samwise as an MCP server integrated with VS Code or Cursor.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Installation Steps](#installation-steps)
3. [IDE Setup](#ide-setup)
4. [Getting API Keys](#getting-your-api-keys)
5. [Verify Installation](#verify-installation)
6. [Troubleshooting](#troubleshooting)

## Prerequisites

- **Node.js**: v18.0.0 or higher
- **npm**: v9.0.0 or higher
- **IDE**: VS Code (with GitHub Copilot) or Cursor
- **API Keys**: OpenRouter API key (free tier available)

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

### 3. Set Your API Key

Set the environment variable for your shell:

```bash
# Bash / Zsh
export SAMWISE_API_KEYS_OPENROUTER=your_openrouter_api_key_here

# PowerShell
$env:SAMWISE_API_KEYS_OPENROUTER = "your_openrouter_api_key_here"

# Or add to config.yaml (samwise.api_keys.openrouter)
```

### 4. Export IDE Configs (Optional)

Regenerate agent files and MCP configs for your IDE:

```bash
npm run export-configs
```

This creates:
- `.github/agents/*.agent.md` — VS Code Copilot agent personas
- `.cursor/rules/*.mdc` — Cursor rule files
- `.vscode/mcp.json` — VS Code MCP server config
- `.cursor/mcp.json` — Cursor MCP server config

## IDE Setup

### VS Code (GitHub Copilot)

The project includes `.vscode/mcp.json` which VS Code reads automatically. Ensure:

1. You have the **GitHub Copilot** extension installed
2. The `SAMWISE_API_KEYS_OPENROUTER` environment variable is set
3. The project is built (`npm run build`)

VS Code will discover the MCP server and expose its tools to Copilot agents. You can verify by opening the Command Palette and running **MCP: List Servers**.

The `.vscode/mcp.json` config:
```jsonc
{
  "servers": {
    "samwise": {
      "type": "stdio",
      "command": "node",
      "args": ["${workspaceFolder}/dist/index.js"],
      "env": {
        "SAMWISE_API_KEYS_OPENROUTER": "${env:SAMWISE_API_KEYS_OPENROUTER}"
      }
    }
  }
}
```

### Cursor

The project includes `.cursor/mcp.json` which Cursor reads automatically. Ensure:

1. The `SAMWISE_API_KEYS_OPENROUTER` environment variable is set
2. The project is built (`npm run build`)

Cursor will discover the MCP server and expose its tools in chat. You can verify in **Settings → MCP Servers**.

The `.cursor/mcp.json` config:
```jsonc
{
  "mcpServers": {
    "samwise": {
      "command": "node",
      "args": ["dist/index.js"],
      "env": {
        "SAMWISE_API_KEYS_OPENROUTER": "${env:SAMWISE_API_KEYS_OPENROUTER}"
      }
    }
  }
}
```

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
| `execute_recipe` | Run a multi-agent recipe |
| `get_cache_stats` | Workflow cache statistics |

## Getting Your API Keys

### OpenRouter (Free Tier Available)

1. Visit [https://openrouter.ai](https://openrouter.ai)
2. Sign up (Google, GitHub, or MetaMask)
3. Navigate to **Settings → API Keys**
4. Create a new API key
5. Set it as `SAMWISE_API_KEYS_OPENROUTER`

All default models are **completely free**:
- `meta-llama/llama-3.2-3b-instruct:free` — Fast, multilingual
- `nousresearch/hermes-3-llama-3.1-405b:free` — Most capable
- `arcee-ai/trinity-large-preview:free` — Creative tasks
- `stepfun/step-3.5-flash:free` — Reasoning

## Verify Installation

### Quick Test

```bash
# Start the MCP server directly
npm start

# Expected output:
# 🚀 Starting Samwise MCP Server v2...
# ✅ Configuration loaded
# ✅ MCP Server connected and ready
# 📦 Tools: health_check, route_model, track_cost, manage_budget, get_analytics, suggest_mode, list_recipes, execute_recipe, get_cache_stats
# 🔗 Waiting for client connection...
```

Press `Ctrl+C` to stop.

### In VS Code / Cursor

1. Open the project in your IDE
2. Open Copilot chat (or Cursor chat)
3. Ask: "Use the health_check tool"
4. You should get a response with `status: healthy` and the tool list

## Troubleshooting

### Error: "Server does not support tools"

**Solution**: Update the MCP SDK — the server requires `capabilities: { tools: {} }` in the Server constructor. Run `npm install` and `npm run build`.

### Error: "Missing API key for OpenRouter provider"

**Solution**: Set `SAMWISE_API_KEYS_OPENROUTER` as an environment variable or in `config.yaml`.

### Error: "Cannot find module 'dist/index.js'"

**Solution**: Build the project first: `npm run build`

### MCP Server Not Showing in IDE

**Solution**:
1. Ensure `.vscode/mcp.json` (or `.cursor/mcp.json`) exists
2. Rebuild: `npm run build`
3. Restart the IDE
4. Check **MCP: List Servers** (VS Code) or **Settings → MCP** (Cursor)

### TypeScript Compilation Errors

```bash
node --version  # Should be v18.0.0+
rm -rf node_modules package-lock.json
npm install
npm run build
```

## Development

```bash
npm run dev          # Watch mode (auto-rebuild)
npm run build        # Full build
npm run export-configs  # Regenerate IDE configs
npm test             # Run tests
npm run lint         # Lint check
npm run clean        # Remove dist/
```

## Next Steps

1. **Read the agent catalog**: See `.github/copilot-instructions.md`
2. **Try a recipe**: Invoke `@plan-exec-rev-ex-planner` with a coding task
3. **Monitor costs**: Ask the agent to use `get_analytics`
4. **Set a budget**: Ask the agent to use `manage_budget` with `set_limit`
