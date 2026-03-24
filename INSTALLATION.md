# Installation Guide — Roland MCP Server

Setup guide for Roland as an MCP server integrated with VS Code or Cursor.

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
- **Goose** (optional): [block.github.io/goose](https://block.github.io/goose/) — required for multi-model routing and autonomous recipes
- **OpenRouter API key** (optional): [openrouter.ai](https://openrouter.ai/) — required for Goose integration

## Installation Steps

### Option A: One-Command Setup (Recommended)

```bash
npx roland-setup
```

This single command will:
1. Check your environment (Node.js version, Goose)
2. Prompt for your OpenRouter API key and validate it
3. Clone Roland into `~/.roland/roland/` (or update if already cloned)
4. Build Roland (`npm install && npm run build`)
5. Initialize the current directory with agent configs and MCP settings
6. Save your API key to `~/.roland/config.yaml`

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

</details>

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
| `.goose/config.yaml` | Goose + Roland config with smart routing instructions |
| `.roland-permissions.json` | Permission policy for Goose sessions |
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
| `run_goose_task` | Spawn autonomous Goose sub-session with file & shell access |
| `git_status` | Current git status — staged, unstaged, untracked |
| `git_diff` | Unified diff of working tree or staged changes |
| `git_log` | Last N commits (oneline format) |
| `git_commit` | Stage files and create a commit |
| `analyze_screenshot` | Capture screen or load image, analyze with vision model |
| `project_context` | Cross-session knowledge base — observe conventions, patterns, decisions, errors |
| `quality_signal` | Record model quality feedback (accept/retry/reject) for adaptive routing |

**Goose users get the full tool set.** VS Code/Cursor users get the routing and cost tools. `run_goose_task`, `git_*`, and `analyze_screenshot` are most useful when Roland is paired with Goose as the MCP client.

No API key is required for the MCP tools themselves. All tools run locally. The IDE's own model handles execution.

## Verify Installation

### Quick Test

1. Build: `npm run build`
2. Open any project in Cursor (with global config) or a project where you ran `init`
3. Go to **Settings → MCP** and verify `roland` shows a green status
4. Open Cursor chat and ask: *"Use the health_check tool"*
5. You should get a response with `status: healthy` and a list of 20 tools

See [TESTING.md](TESTING.md) for a full testing walkthrough.

## Goose Setup (OpenRouter)

Roland works as a [Goose](https://block.github.io/goose/) MCP extension with smart model routing via OpenRouter.

### How It Works

```
User prompt
  → Goose main session (coordinator)
    → Roland MCP tools: triage, route_model, session_context
      → Routes to best model for the job
    → Goose Developer extension: text_editor + bash
      → Reads/writes files, runs shell commands, runs tests
    → run_goose_task: spawns focused sub-sessions for heavy coding
    → git_status/diff/commit: native git workflow
    → analyze_screenshot: vision analysis for UI/error debugging
  → Result returned to user, session context updated
```

### Prerequisites

- **Goose**: Install from [block.github.io/goose](https://block.github.io/goose/)
- **OpenRouter API key**: Sign up at [openrouter.ai](https://openrouter.ai/) and set `OPENROUTER_API_KEY`
- **Roland**: Built (`npm run build`) — or use `npx roland-setup` which handles everything

### 1. Configure Goose

Copy the template config or merge into your existing Goose config:

```bash
# Copy the template
cp roland/goose/config.yaml ~/.config/goose/config.yaml

# Or merge the roland extension into your existing config
```

Edit `~/.config/goose/config.yaml` and update the Roland extension path:

```yaml
extensions:
  roland:
    type: stdio
    cmd: "node"
    args:
      - "/absolute/path/to/roland/dist/index.js"   # <-- UPDATE THIS
    enabled: true
    timeout: 300
```

### 2. Set Environment Variables

```bash
export OPENROUTER_API_KEY=sk-or-...your-key...
```

### 3. Verify

```bash
goose session
# In the session, type:
> /tools
# You should see Roland's tools: triage, route_model, track_cost, etc.

> Use the health_check tool
# Should return: status: healthy
```

### 4. Use Goose Recipes (Optional)

Run pre-built multi-agent workflows:

```bash
goose run --recipe goose/recipes/roland-plan-exec-rev-ex.yaml --task "Build a todo app"
goose run --recipe goose/recipes/roland-bugfix.yaml --task "Fix the login timeout issue"
goose run --recipe goose/recipes/roland-security-audit.yaml --task "Audit the auth module"
```

### 5. Init a Project (Recommended)

Run `roland init` in your project directory to scaffold everything:

```bash
cd /path/to/roland
npm run init -- /path/to/your/project
```

What gets created in your project:

| File | Purpose |
|------|---------|
| `.goose/config.yaml` | Goose + Roland wiring with smart routing instructions |
| `.roland-permissions.json` | Permission policy for Goose sessions (edit to add restrictions) |
| `roland-context.json` | Structured project context (rules, decisions, patterns) |
| `MIGRATION.md` | Human-readable companion to roland-context.json |
| `.cursor/mcp.json` | Cursor MCP config |
| `.vscode/mcp.json` | VS Code MCP config |
| `.github/agents/*.agent.md` | Agent personas |

The `.goose/config.yaml` wires Roland into every Goose session automatically — `load_migration_context` runs at session start, so the agent always has your project context.

### Dispatcher Model Selection

The dispatcher model handles routing only — it should be cheap/free and support tool calling. Recommended free models:

| Model | Notes |
|-------|-------|
| `anthropic/claude-haiku-4.5` | Best instruction following, reliable tool calling (default) |
| `google/gemini-2.5-flash` | Cheaper alternative, good tool calling |
| `google/gemini-2.0-flash-exp:free` | Free option (less reliable) |

Change the main session model in `~/.config/goose/config.yaml`:

```yaml
GOOSE_MODEL: anthropic/claude-haiku-4.5   # $52/mo — precise instruction following (default)
# GOOSE_MODEL: anthropic/claude-sonnet-4  # $95/mo — upgrade if Haiku isn't enough
# GOOSE_MODEL: google/gemini-2.5-flash    # $18/mo — budget option
```

The main session handles routing AND file edits. Sonnet 4 subagents handle complex code authoring via smart triage.

## Docker Setup (Sandboxed Sessions)

Run Roland + Goose inside a Docker container for process-level permission isolation. The container can only access the mounted project directory — no host filesystem, home directory, or system commands outside the mount.

### Build the image

```bash
cd /path/to/roland
npm run build
docker build -t roland-goose:latest .
```

### Run a sandboxed session

```bash
# Interactive session
./scripts/roland-docker.sh /path/to/project session

# Headless task
./scripts/roland-docker.sh /path/to/project run --no-session -t "Fix the auth bug"

# Current directory
./scripts/roland-docker.sh .
```

The script auto-builds the image if it doesn't exist. Set `OPENROUTER_API_KEY` in your environment before running.

### What the container mounts

| Mount | Access | Purpose |
|-------|--------|---------|
| `/workspace` (your project) | Read-write | File editing, git, tests |
| `.goose/config.yaml` | Read-only | Goose + Roland wiring |

Everything else (home directory, system files, other projects) is inaccessible. This is **stronger** than Claude Code's per-tool approval — the container physically cannot reach outside the project.

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

1. **Quick setup**: `npx roland-setup` — handles clone, build, API key, and project init in one command
2. **Set your budget**: Ask the agent to use `manage_budget` with `set_limit`
3. **Run a solo recipe**: `npx tsx scripts/run-recipe.ts --recipe QuickShip --task "Add user settings page"`
4. **Monitor costs**: `get_analytics` — see where tokens and money are going, including model quality data
5. **Build project knowledge**: Use `project_context` with `observe` to record conventions and patterns — they'll persist across sessions
6. **Read the guides**: See `docs/guides/goose-user-guide.md` for full usage
