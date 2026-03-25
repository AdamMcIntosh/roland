# Roland

> AI agent orchestration as an MCP server — multi-agent recipes, cost visibility, and IDE-native personas.

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)]()
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg)]()
[![MCP](https://img.shields.io/badge/MCP-1.0.4-purple.svg)]()

Roland is an MCP (Model Context Protocol) server that gives your AI agent superpowers: multi-agent recipe workflows, auto-pilot triage, session cost tracking, budget management, and 32 specialized agent personas. Works with VS Code (Copilot), Cursor, and [Goose](https://block.github.io/goose/) (Block's open-source AI agent with OpenRouter).

With Goose, Roland acts as a smart dispatcher: a cheap model handles routing, calls Roland's `triage` tool to analyze complexity, then spawns subagents on the recommended OpenRouter model with the right persona instructions. IDEs and Goose control which model runs — Roland focuses on what they can't do: orchestrating multi-step workflows across specialized agents, tracking what you're spending, and triaging every prompt to the right persona.

**Version**: 2.0.0

---

## Key Features

### MCP Tools
Eleven tools exposed to any MCP-compatible client (VS Code Copilot, Cursor, Claude Desktop, Goose, etc.):

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
| `session_context` | Persistent session memory — decisions, files, patterns, migrations |

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

### Goose Integration (OpenRouter)
Roland works as a [Goose](https://block.github.io/goose/) MCP extension with smart model routing via OpenRouter:
- **Smart triage**: Analyzes complexity → routes simple tasks to Flash, complex tasks to Sonnet 4
- **Hybrid execution**: Sonnet 4 subagent writes complex code, main session applies files to disk
- **Multi-agent recipes**: PlanExecRevEx, BugFix, SecurityAudit with per-step model selection
- **Budget protection**: Auto-degrades to free models at 80% spend (~$68 of $85 budget)
- **~$50/month** at moderate usage (10 tasks/day)

See [INSTALLATION.md](INSTALLATION.md) for Goose setup and the [Goose User Guide](docs/guides/goose-user-guide.md) for full details.

### Smart Triage — How It Works

Roland's `triage` tool returns an `execution_strategy` that tells Goose how to handle each task:

```
Simple/medium task (70% of work):
  → Main session (Flash) writes code and edits files directly
  → Cost: ~$0.01 per task

Complex task (30% of work):
  → Sonnet 4 subagent writes the code
  → Main session applies it to files mechanically
  → Cost: ~$0.15 per task
```

This gives you Sonnet 4 quality on complex tasks without paying Sonnet 4 prices for every typo fix.

### When to Use Roland vs. Your IDE Agent

| Task | Use | Why |
|------|-----|-----|
| Typo, rename, one-liner | **Windsurf / Cursor** | Direct edit, no cost |
| Small bug fix (single file) | **Windsurf / Cursor** | One LLM call is enough |
| Simple refactor | **Windsurf / Cursor** | IDE agent handles it fine |
| Multi-file bug, root cause unknown | **Roland (BugFix recipe)** | Multi-agent workflow, Sonnet 4 diagnosis |
| Architecture, system design | **Roland (architect)** | Sonnet 4 subagent for best reasoning |
| Security audit | **Roland (SecurityAudit)** | Sonnet 4 threat modeling + code review |
| Complex feature (plan → build → review) | **Roland (PlanExecRevEx)** | Sonnet 4 writes code, multi-agent review |

#### Model tiers

| Tier | Model | Cost/1M tokens | Used for |
|------|-------|---------------|----------|
| Complex code + thinking | `anthropic/claude-sonnet-4` | $3 / $15 | Code authoring, architecture, security, planning, review |
| Medium text tasks | `deepseek/deepseek-chat` (V3) | $0.27 / $1.10 | Text-only subagents for medium tasks |
| Main session | `anthropic/claude-haiku-4.5` | $1 / $5 | Routing, file I/O, tool calling — precise instruction following |
| Light | `google/gemini-2.5-flash` | $0.15 / $0.60 | Docs, exploration |

#### Monthly cost (~$52 at moderate usage, $85 budget)

| Level | Cost | Headroom |
|-------|------|----------|
| Light (5 tasks/day) | ~$28 | $57 |
| Moderate (10/day) | ~$52 | $33 |
| Heavy (20/day) | ~$82 | $3 |
| At 80% ($68) | Degrades to free models | $0 after |

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

### One-Command Setup

```bash
curl -fsSL https://raw.githubusercontent.com/AdamMcIntosh/roland/main/scripts/setup.sh | bash
```

This single command will:
1. Check your environment (Node.js version, Goose)
2. Prompt for your [OpenRouter API key](https://openrouter.ai/) and validate it
3. Clone Roland into `~/.roland/roland/` (or `git pull` if it already exists)
4. Build Roland (`npm install && npm run build`)
5. Initialise the current directory with agent configs and MCP settings
6. Save your API key to `~/.roland/config.yaml`

**Verify**: Ask your IDE agent to "Use the health_check tool" — you should get `status: healthy`.

### Manual Setup

<details>
<summary>Click to expand manual setup steps</summary>

#### Install & Build

```bash
git clone https://github.com/AdamMcIntosh/roland.git
cd roland
npm install
npm run build
```

#### Use in Any Project

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

</details>

### Use with Goose

```bash
# 1. Install Goose: https://block.github.io/goose/
# 2. Run one-command setup (handles clone + build + init)
curl -fsSL https://raw.githubusercontent.com/AdamMcIntosh/roland/main/scripts/setup.sh | bash

# 3. Start a Goose session
goose session

# 4. Prompt normally — Roland auto-routes to the best model + persona
> Build a REST API for managing tasks with authentication

# 5. Run a Goose recipe
goose run --recipe ~/.roland/roland/goose/recipes/roland-plan-exec-rev-ex.yaml --task "Build a todo app"
```

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
npm run qa:all                            # All 10 scenarios; timings vs baseline benchmarks
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

#### RCO vs. Alternatives (Why RCO?)

RCO is a modular, IDE-hybrid alternative to other multi-agent code runners:

| Focus | RCO | Typical alternatives |
|-------|-----|----------------------|
| **Extensibility** | YAML-driven agents and recipes; add files to extend. | Often fixed workflows. |
| **IDE + Claude** | Cursor export (`.cursor/rules` + MCP snippet), optional dashboard; single-model Claude focus. | Varies. |
| **Eco mode** | Built-in: prefer Haiku for simple steps to reduce token usage. | Not standard. |
| **Original skills** | e.g. **dependency-mapper** (DOT graph of agent handoffs). | N/A. |
| **Stability** | Zod validation, timeouts, retries, state file locking for parallel-swarm. | Varies. |

Benchmark-style comparisons are available via `npm run qa:all` (mock workers; timings vs hardcoded baseline). Real runs use real workers and depend on environment.

#### Benchmarks

Run sample tasks and compare RCO timing to a simulated baseline:

```bash
npm run benchmark
```

The benchmark runs three sample tasks (e.g. "Build todo app", "CLI tool", "Bug fix") with the RCO orchestrator and reports elapsed time and step count. A simulated baseline (fixed ms per step, no real execution) is printed for comparison. Results can be used to validate performance and document wins (e.g. RCO's modularity and eco mode reducing steps for simple tasks). For full QA scenarios and timings, use `npm run qa:all`.

#### RCO features (summary)

- **Claude pivot**: All agent models are Claude variants (e.g. `claude-3-5-sonnet-20241022`, `claude-3-haiku-20240307`). Mock by default; optional Puppeteer-based simulation or plug in a real Claude interface.
- **Execution modes**: `autonomous-loop` (conditional looping, max 5 iterations), `parallel-swarm` (concurrent forks + file locking), `linear`, **adaptive-swarm** (scale steps by task complexity), **collab-mode** (pause for real-time user feedback via dashboard WebSocket).
- **Tools/skills**: Stub tools (`search`, `code`, `terminal`) plus **dependency-mapper** (DOT graph for handoffs).
- **Eco mode**, **task_routing**, **state** (`.rco-state.json`), **Cursor export** (session → `.cursor/rules` + MCP JSON).
- **Session persistence** (notepad prompts + local JSON fallback), dynamic Cursor rules from agent outputs, Zod validation for prompts/state/outputs.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│              IDE / MCP Client / Goose Agent                  │
│  (VS Code Copilot, Cursor, Claude Desktop, Goose)          │
├─────────────────────────────────────────────────────────────┤
│                   MCP Server (stdio)                        │
│  (mcp-server.ts — 11 registered tools)                     │
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

| Doc | Contents |
|-----|----------|
| [INSTALLATION.md](INSTALLATION.md) | Setup, IDE configuration, project portability |
| [Goose User Guide](docs/guides/goose-user-guide.md) | Goose setup, model tiers, budget management, recipes |
| [Roland vs Claude Code](docs/guides/comparison-claude-code.md) | Honest quality comparison, enterprise workflow, cost analysis |
| [TESTING.md](TESTING.md) | Automated tests (Vitest), manual IDE tests, QA scenarios, benchmarks |
| [RECIPES_CATALOG.md](RECIPES_CATALOG.md) | Complete recipe reference with agent chains |
| [CHANGELOG.md](CHANGELOG.md) | Version history (Keep a Changelog format) |
| [ROADMAP.md](ROADMAP.md) | v0.1 checklist, v0.2 sprints, v1.0 vision |
| [docs/guides/budget-guide.md](docs/guides/budget-guide.md) | Cost management & spending limits |
| [docs/guides/cache-guide.md](docs/guides/cache-guide.md) | Caching strategies |
| [docs/blog-post.md](docs/blog-post.md) | "RCO: The Modular Alternative for Claude Code" |
| [docs/beta-testers.md](docs/beta-testers.md) | Beta program — how to join & give feedback |
| [docs/development-history.md](docs/development-history.md) | Internal: MVP through Phase 4 evolution |

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
npm run qa:all           # RCO QA: all scenarios; timings vs baseline benchmarks
npm test                 # Run tests (watch)
npm run test:run         # Run tests once
npm run test:rco         # RCO tests only (orchestrator, loadConfig, stateLock, tools)
npm run serve-dashboard # Serve dashboard-ui on port 8081
npm run benchmark       # RCO benchmark: sample tasks vs simulated baseline
npm run lint             # Lint check
npm run clean            # Remove dist/
npm start                # Start MCP server directly
```

**RCO benchmark report:** Run `npm run qa:all` and use the printed timings (and diff vs baseline) as a benchmark report. For real recipe runs, use `npm run rco` and check stderr for `console.time` output when `RCO_VERBOSE` is set.

---

## License

MIT