# RCO: The Modular Alternative for Claude Code

Roland Code Orchestrator (RCO) is a modular, Claude-native orchestration layer that brings multi-agent workflows, slash commands, and IDE sync to your coding sessions—without locking you into a single vendor stack.

## Introduction

RCO runs inside Claude as a first-class plugin. You get recipe-based workflows (Plan-Execute-Review-Explain, BugFix, SecurityAudit, WebAppFullStack, and more), 40+ agent personas, and export to Cursor/VS Code so you can continue where Claude left off. Everything is configurable via YAML and extensible with custom agents and skills.

## Features

- **Native Claude integration** — Slash commands like `/rco-run:recipe PlanExecRevEx --task "Build a todo app"` run full workflows inside Claude.
- **Modular design** — Agents and recipes are YAML files; add or fork agents without touching core code.
- **Advanced modes** — Adaptive swarm and collab mode for complex tasks.
- **Cursor/IDE export** — Export session state to `.cursor` rules and MCP snippets for seamless handoff.
- **Tauri dashboard** — Cross-platform desktop app for real-time graphs and metrics.
- **Hybrid IDE sync** — Use RCO from Claude and continue in Cursor with the same context.
- **Customization** — Create agents via prompt: `/rco-new-agent "Create agent for API testing"`.
- **Analytics & benchmarking** — Track steps, tokens, and compare workflows.

## Why choose RCO?

| Aspect        | RCO                                      |
|---------------|------------------------------------------|
| Architecture  | Modular YAML agents + recipes            |
| Extension     | Add agents/recipes via files or prompts  |
| IDE support   | Export to Cursor, MCP, VS Code stubs     |
| Distribution  | npm, Claude plugin zip, Tauri binaries   |
| Telemetry     | Opt-in (Sentry); consent via `/rco-consent:yes` |
| License       | MIT                                      |

You keep full control of your workflows and data while still getting structured orchestration and handoffs.

## Install

### Option 1: npm (Node 18+)

```bash
npm install roland
# or globally: npm install -g roland
npx roland-mcp   # run MCP server
```

### Option 2: Claude plugin (zip)

1. Download the latest `roland-plugin-*.zip` from [Releases](https://github.com/AdamMcIntosh/roland/releases).
2. In Claude Desktop (or compatible host), add the plugin and point it to the extracted folder (or sideload the zip per your host’s instructions).

### Option 3: Curl installer (macOS/Linux)

```bash
curl -fsSL https://raw.githubusercontent.com/AdamMcIntosh/roland/main/install.sh | sh
# Custom dir: curl ... | sh -s -- /opt/rco
```

### Option 4: Tauri app

Download the desktop dashboard from [Releases](https://github.com/AdamMcIntosh/roland/releases) (macOS, Windows, Linux).

## Quick start

1. **Run a recipe** (in Claude):  
   `/rco-run:recipe PlanExecRevEx --task "Add login to my app"`

2. **Opt-in telemetry** (optional):  
   `/rco-consent:yes`

3. **Export to Cursor**  
   After a run, export is automatic; use the generated `.cursor` rule and MCP snippet in Cursor.

## Links

- [GitHub](https://github.com/AdamMcIntosh/roland)
- [Issues & feature requests](https://github.com/AdamMcIntosh/roland/issues)
- [Beta program](docs/beta-testers.md)
