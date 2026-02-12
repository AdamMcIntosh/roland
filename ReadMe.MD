# Samwise

> AI agent orchestration as an MCP server — cost-routed models, multi-agent recipes, and IDE-native personas.

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)]()
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg)]()
[![MCP](https://img.shields.io/badge/MCP-1.0.4-purple.svg)]()

Samwise is an MCP (Model Context Protocol) server that gives your IDE agent superpowers: complexity-based model routing, session cost tracking, budget management, and multi-agent recipe execution — all via free-tier OpenRouter models. It also exports 32 specialized agent personas directly into VS Code (Copilot) and Cursor as native config files.

**Version**: 2.0.0

---

## Key Features

### MCP Tools
Nine tools exposed to any MCP-compatible client (VS Code Copilot, Cursor, Claude Desktop, etc.):

| Tool | Purpose |
|------|---------|
| `health_check` | Server status & uptime |
| `route_model` | Analyze task complexity → recommend cheapest adequate model |
| `track_cost` | Log token usage, return session totals |
| `manage_budget` | Get/set/reset spending limits |
| `get_analytics` | Cost & token breakdowns by model, agent, provider |
| `suggest_mode` | Recommend quick/standard/deep effort level |
| `list_recipes` | Browse available multi-agent workflow recipes |
| `execute_recipe` | Run a multi-agent recipe end-to-end |
| `get_cache_stats` | Workflow cache hit rate & memory usage |

### 32 Specialized Agent Personas
YAML-defined agents in `./agents/`, exported as IDE-native config files:

| Agent | Role |
|-------|------|
| architect | System design & architecture |
| researcher | Information gathering & analysis |
| executor | Implementation & coding |
| designer | UI/UX design |
| planner | Task breakdown & planning |
| critic | Code review & validation |
| qa-tester | Quality assurance & testing |
| writer | Documentation & technical writing |
| analyst | Data & trend analysis |
| vision | Technical strategy & long-term planning |
| scientist | Data analysis & hypothesis testing |
| security-reviewer | Security auditing & hardening |
| build-fixer | Build error resolution |
| code-reviewer | Comprehensive code review |
| tdd-guide | Test-driven development guidance |
| explore | Codebase navigation & mapping |

Most agents have tiered variants (`-low`, `-medium`, `-high`) for different depth levels.

### 7 Pre-Built Recipes
Multi-agent workflow templates in `./recipes/`:

| Recipe | Agent Chain | Use Case |
|--------|-------------|----------|
| **PlanExecRevEx** | Planner → Executor → Reviewer → Explainer | Autonomous coding loop |
| **BugFix** | Analyst → Researcher → Architect → Executor → QA → Critic → Writer | Systematic bug resolution |
| **RESTfulAPI** | Architect → Executor → Critic → Writer | API design through docs |
| **SecurityAudit** | Architect → Critic → Executor → Writer | Threat modeling to remediation |
| **WebAppFullStack** | Architect → Designer → Executor → Critic → Writer | Full-stack development |
| **MicroservicesArchitecture** | Architect → Executor → Critic → Writer | Service decomposition |
| **DocumentationRefactor** | Analyst → Architect → Writer → Critic | Codebase-aware doc improvement |

### Cost Optimization
- **Complexity-based model routing** — automatically selects the cheapest adequate model
- **Session cost tracking** — per-model, per-agent, per-provider breakdowns
- **Budget management** — set spending limits with real-time enforcement
- **Free tier by default** — all default models use OpenRouter free tier ($0)

### IDE-Native Integration
Run `npm run export-configs` to generate:
- `.github/agents/*.agent.md` — VS Code Copilot agent personas (64 files)
- `.cursor/rules/*.mdc` — Cursor rule files (32 files)
- `.vscode/mcp.json` / `.cursor/mcp.json` — MCP server configuration
- `.github/copilot-instructions.md` — Project-wide agent instructions

---

## Quick Start

### Prerequisites
- **Node.js** >= 18.0.0
- **OpenRouter API key** (free tier available at [openrouter.ai](https://openrouter.ai))

### Install & Build

```bash
git clone https://github.com/yourusername/samwise.git
cd samwise
npm install
npm run build
```

### Use in Your IDE

The project ships with MCP configs for both VS Code and Cursor. After building:

1. Open the project in your IDE
2. The MCP server starts automatically when the IDE connects
3. Agent personas are available in chat (e.g., `@architect`, `@executor`)
4. MCP tools are available to the IDE agent

**Verify**: Ask your IDE agent to "Use the health_check tool" — you should get `status: healthy`.

See [INSTALLATION.md](INSTALLATION.md) for detailed setup instructions.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      IDE / MCP Client                       │
│  (VS Code Copilot, Cursor, Claude Desktop)                 │
├─────────────────────────────────────────────────────────────┤
│                   MCP Server (stdio)                        │
│  (mcp-server.ts — 9 registered tools)                      │
├─────────────────────────────────────────────────────────────┤
│                  Orchestration Layer                        │
│  (model-router, cost-calculator, workflow-engine)          │
├─────────────────────────────────────────────────────────────┤
│                   Agent & Recipe System                     │
│  (agent-loader, recipe-loader, YAML definitions)           │
├─────────────────────────────────────────────────────────────┤
│                   Support Systems                           │
│  (cache, config, utils, monitoring)                        │
└─────────────────────────────────────────────────────────────┘
```

**Stack**: TypeScript 5.7 · Node.js 18+ · MCP SDK 1.0.4 · OpenRouter · YAML/Zod

---

## Documentation

- [INSTALLATION.md](INSTALLATION.md) — Setup & IDE configuration
- [EXAMPLE_WORKFLOWS.md](EXAMPLE_WORKFLOWS.md) — Workflow structure & examples
- [RECIPES_CATALOG.md](RECIPES_CATALOG.md) — Complete recipe reference
- [CHANGELOG.md](CHANGELOG.md) — Version history
- [docs/guides/budget-guide.md](docs/guides/budget-guide.md) — Cost management
- [docs/guides/cache-guide.md](docs/guides/cache-guide.md) — Caching strategies

---

## Development

```bash
npm run build           # Compile TypeScript → dist/
npm run dev             # Watch mode (auto-rebuild)
npm run export-configs  # Regenerate IDE agent/rule files
npm test                # Run tests
npm run lint            # Lint check
npm run clean           # Remove dist/
npm start               # Start MCP server directly
```

---

## License

MIT © Samwise Contributors