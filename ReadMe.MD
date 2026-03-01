# Roland

> AI agent orchestration as an MCP server — multi-agent recipes, cost visibility, and IDE-native personas.

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)]()
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg)]()
[![MCP](https://img.shields.io/badge/MCP-1.0.4-purple.svg)]()

Roland is an MCP (Model Context Protocol) server that gives your IDE agent superpowers: multi-agent recipe workflows, auto-pilot triage, session cost tracking, budget management, and 32 specialized agent personas exported directly into VS Code (Copilot) and Cursor as native config files.

IDEs control which model runs your requests — Roland focuses on what they can't do: orchestrating multi-step workflows across specialized agents, tracking what you're spending, and triaging every prompt to the right persona.

**Version**: 2.0.0

---

## Key Features

### MCP Tools
Ten tools exposed to any MCP-compatible client (VS Code Copilot, Cursor, Claude Desktop, etc.):

| Tool | Purpose |
|------|---------|
| `health_check` | Server status & uptime |
| `triage` | Auto-pilot — analyze any prompt → recommend agent + recipe |
| `route_model` | Analyze task complexity → recommend cheapest adequate model |
| `track_cost` | Log token usage, return session totals |
| `manage_budget` | Get/set/reset spending limits |
| `get_analytics` | Cost & token breakdowns by model, agent, provider |
| `suggest_mode` | Recommend quick/standard/deep effort level |
| `list_recipes` | Browse available multi-agent workflow recipes |
| `start_recipe` | Begin a multi-agent recipe session, get first step prompt |
| `advance_recipe` | Submit step output, get next step or final summary |

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

### 9 Pre-Built Recipes
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
| **DesktopApp** | Architect → Designer → Executor → QA → Critic → Writer | Desktop/native app development |
| **CodeReviewCompliance** | Researcher → Code-Reviewer → Critic → Writer | Code review & requirements compliance |

### Auto-Pilot Mode
Roland includes a `triage` tool and a Cursor auto-pilot rule (`roland-autopilot.mdc`) that fires on every message. When enabled, the IDE automatically calls `triage` before processing your prompt, which analyzes your intent and recommends the best agent or recipe — no `@agent` mention required.

Skip conditions: explicit `@agent` mentions, direct tool/recipe requests, mid-recipe steps, follow-up questions.

### Cost Visibility & Budget Management
IDEs provide zero insight into what you're spending. Roland fills that gap:
- **Session cost tracking** — per-model, per-agent, per-provider breakdowns
- **Budget management** — set spending limits with real-time enforcement
- **Cost analytics** — understand where your tokens go across sessions
- **Model routing (advisory)** — complexity analysis recommends the cheapest adequate model, but the IDE ultimately controls model selection

### IDE-Native Integration
Run `npm run init -- /path/to/your/project` to set up any project with Roland, or `npm run export-configs` for the Roland repo itself:
- `.github/agents/*.agent.md` — VS Code Copilot agent personas (70 files: 32 agents + 38 recipe handoffs)
- `.cursor/rules/*.mdc` — Cursor rule files (32 files + auto-pilot rule)
- `.vscode/mcp.json` / `.cursor/mcp.json` — MCP server configuration
- `.github/copilot-instructions.md` — Project-wide agent instructions

---

## Quick Start

### Prerequisites
- **Node.js** >= 18.0.0

### Install & Build

```bash
git clone https://github.com/yourusername/roland.git
cd roland
npm install
npm run build
```

### Use in Any Project

After building, run the init command to set up Roland in your target project:

```bash
npm run init -- /path/to/your/project
```

This copies all agent personas, recipe configs, MCP server config, and the auto-pilot rule into your project. Then:

1. Open your project in Cursor or VS Code
2. The MCP server starts automatically when the IDE connects
3. Agent personas are available in chat (e.g., `@architect`, `@executor`)
4. Auto-pilot mode triages every prompt to the best agent/recipe

**Verify**: Ask your IDE agent to "Use the health_check tool" — you should get `status: healthy`.

See [INSTALLATION.md](INSTALLATION.md) for detailed setup instructions (includes global Cursor config option).

### Roland Code Orchestrator (RCO)

RCO is a lightweight, Claude-centric multi-agent orchestrator that runs **outside** the MCP server: it uses Node.js `child_process.fork` for on-demand agent workers, YAML configs, and optional WebSocket monitoring.

#### RCO usage

**Basic run (PlanExecRevEx recipe):**

```bash
npm run build
npm run rco -- --recipe PlanExecRevEx --task "Build a todo app"
```

- **Without building**: `npm run rco:dev -- --recipe PlanExecRevEx --task "Build a todo app"` (runs with tsx)
- **With dashboard**: add `--dashboard` to start a WebSocket server on port 8080 (config: `config.yaml` → `rco.dashboard_port`)
- **No Cursor export**: add `--no-export` to skip writing `.cursor/rules` and MCP JSON from the session
- **Quiet**: add `--quiet` to reduce stderr logging

**Manual QA and benchmarks:**

```bash
npm run qa -- --scenario todo-app        # Single scenario (mock workers)
npm run qa:all                            # All 10 scenarios; timings vs OMC benchmark mocks
```

**Tests:**

```bash
npm run test:rco                          # RCO unit + integration tests only
npm run test:run                          # Full test suite
```

**Optional Puppeteer-based Claude simulation** (headless browser mock): set `RCO_USE_PUPPETEER=1` before running RCO so the agent worker loads a local HTML mock page instead of an inline mock. Requires `puppeteer` installed.

**Verbose profiling:** Orchestrator uses `console.time`/`timeEnd` when `RCO_VERBOSE` is not `0` or `false`. Worker timeout and retries are configurable via orchestrator options (default 60s timeout, 2 retries).

#### RCO YAML guide

- **Agents** (`agents/*.yaml`): Each file defines `name`, optional `role_prompt`, `claude_model` (e.g. `claude-3-5-sonnet-20241022`), `tools` (e.g. `search`, `code`, `dependency-mapper`). RCO uses the same 32 agent YAMLs as the rest of Roland; set `claude_model` for RCO to target that Claude model.
- **Recipes** (`recipes/rco/*.yaml` or `recipes/<Name>.yaml`): Define `name`, `execution_mode` (`autonomous-loop` | `parallel-swarm` | `linear`), `max_loops`, and `workflow.steps`. Each step has `agent`, optional `input` (e.g. `{{user_task}}`), `output_to`, `loop_if` (substring in output to trigger loop), and `final_output: true`. Optional `subagents` override `agentRef` and `claude_model` per step.
- **Config** (`config.yaml` → `rco`): `claude_models` (complex/medium/simple/explain), `eco_mode`, `task_routing` (pattern → agents), `dashboard_port`, `state_file`.

#### RCO vs. OMC (Why RCO?)

RCO is a modular, IDE-hybrid alternative to other multi-agent code runners:

| Focus | RCO | Typical alternatives |
|-------|-----|----------------------|
| **Extensibility** | YAML-driven agents and recipes; add files to extend. | Often fixed workflows. |
| **IDE + Claude** | Cursor export (`.cursor/rules` + MCP snippet), optional dashboard; single-model Claude focus. | Varies. |
| **Eco mode** | Built-in: prefer Haiku for simple steps to reduce token usage. | Not standard. |
| **Original skills** | e.g. **dependency-mapper** (DOT graph of agent handoffs). | N/A. |
| **Stability** | Zod validation, timeouts, retries, state file locking for parallel-swarm. | Varies. |

Benchmark-style comparisons are available via `npm run qa:all` (mock workers; timings vs hardcoded OMC-style baseline). Real runs use real workers and depend on environment.

#### RCO features (summary)

- **Claude pivot**: All agent models are Claude variants (e.g. `claude-3-5-sonnet-20241022`, `claude-3-haiku-20240307`). Mock by default; optional Puppeteer-based simulation or plug in a real Claude interface.
- **Execution modes**: `autonomous-loop` (conditional looping, max 5 iterations), `parallel-swarm` (concurrent forks + file locking), `linear`.
- **Tools/skills**: Stub tools (`search`, `code`, `terminal`) plus **dependency-mapper** (DOT graph for handoffs).
- **Eco mode**, **task_routing**, **state** (`.rco-state.json`), **Cursor export** (session → `.cursor/rules` + MCP JSON).

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      IDE / MCP Client                       │
│  (VS Code Copilot, Cursor, Claude Desktop)                 │
├─────────────────────────────────────────────────────────────┤
│                   MCP Server (stdio)                        │
│  (mcp-server.ts — 10 registered tools)                     │
├─────────────────────────────────────────────────────────────┤
│                  Orchestration Layer                        │
│  (model-router, complexity-classifier, cost-tracker)       │
├─────────────────────────────────────────────────────────────┤
│              Recipe Sessions & Agent Definitions            │
│  (recipe-session, YAML agents & recipes)                   │
├─────────────────────────────────────────────────────────────┤
│                   Support Systems                           │
│  (config-loader, budget-manager, logger)                   │
└─────────────────────────────────────────────────────────────┘
```

**Stack**: TypeScript 5.7 · Node.js 18+ · MCP SDK 1.0.4 · YAML/Zod

---

## Documentation

- [INSTALLATION.md](INSTALLATION.md) — Setup & IDE configuration
- [RECIPES_CATALOG.md](RECIPES_CATALOG.md) — Complete recipe reference
- [CHANGELOG.md](CHANGELOG.md) — Version history
- [TESTING.md](TESTING.md) — Test strategy & running tests
- [docs/guides/budget-guide.md](docs/guides/budget-guide.md) — Cost management
- [docs/guides/cache-guide.md](docs/guides/cache-guide.md) — Caching strategies

---

## Development

```bash
npm run build           # Compile TypeScript → dist/
npm run dev             # Watch mode (auto-rebuild)
npm run init -- <path>  # Set up Roland in an external project
npm run export-configs  # Regenerate IDE configs for this repo
npm run rco -- --recipe PlanExecRevEx --task "..."  # RCO orchestrator (after build)
npm run rco:dev -- --recipe PlanExecRevEx --task "..."  # RCO without building (tsx)
npm run qa              # RCO QA: one scenario (todo-app), mock workers
npm run qa:all           # RCO QA: all scenarios; timings vs OMC benchmark mocks
npm test                 # Run tests (watch)
npm run test:run         # Run tests once
npm run test:rco         # RCO tests only (orchestrator, loadConfig, stateLock, tools)
npm run lint             # Lint check
npm run clean            # Remove dist/
npm start                # Start MCP server directly
```

**RCO benchmark report:** Run `npm run qa:all` and use the printed timings (and diff vs OMC-style baseline) as a benchmark report. For real recipe runs, use `npm run rco` and check stderr for `console.time` output when `RCO_VERBOSE` is set.

---

## License

MIT