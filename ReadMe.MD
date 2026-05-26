# Roland

> PM-first AI engineering team — type a goal, watch a team of agents build it.

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)]()
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg)]()

Roland runs a **Lead PM (Claude Opus)** that decomposes your goal into parallel tasks and dispatches them to a team of **specialist engineers** (architect, executor, test-author, code-reviewer…). Each wave of work is reviewed before the next begins. The result lands in your terminal as an executive-ready synthesis.

**Version**: 2.0.0

---

## Daily Usage

```bash
# Run a team on any goal — live dashboard, project memory, notifications
roland "add rate limiting to the Fastify API"

# Watch git — auto-run on every commit, notify on phone
roland watch --webhook https://ntfy.sh/my-alerts

# Review (and fix) a GitHub PR
roland pr 42 --fix --notify

# Always get notified (add to shell profile)
export ROLAND_NOTIFY=1
```

---

## Commands

| Command | What it does |
|---------|--------------|
| `roland "goal"` | Run a PM team on a goal _(shortcut for `roland team`)_ |
| `roland team "goal"` | Same — with full flag control |
| `roland watch` | Auto-run on git commits or file changes |
| `roland pr [number]` | Review / fix a GitHub PR via `gh` CLI |
| `roland status` | Live TUI observer from a second terminal |
| `roland doctor` | Diagnose install, agents, recipes, permissions |
| `roland pm-log` | Print the PM event timeline |
| `roland mcp-config` | Print / merge the Cursor MCP config entry |
| `roland serve` | Start the MCP server (default when no subcommand) |
| `roland --help` | Full flag reference |

### Core flags _(team / watch / pr)_

| Flag | Description |
|------|-------------|
| `--notify`, `-n` | Desktop notification on complete/error |
| `--webhook <url>` | POST to ntfy.sh, Slack, Discord, or any URL |
| `--state-dir <dir>` | Persistence dir — Blackboard, memory, run state _(default: `.roland`)_ |
| `--quiet`, `-q` | Suppress progress; only print synthesis to stdout |
| `--no-tui` | Scrolling log instead of live dashboard |

### `roland team`

```bash
roland team "Build a REST API for bookstore inventory"
roland team "..." --stream          # print agent output snippets as tasks complete
roland team "..." --no-tui          # scrolling log (CI-friendly)
roland team "..." --quiet           # synthesis only (pipeable)
roland team "..." --notify --webhook https://ntfy.sh/alerts
```

### `roland watch`

```bash
roland watch                                    # git commits → commit message as goal
roland watch --task "run full review"           # fixed goal on every commit
roland watch --pattern "src/**/*.ts"            # file changes instead of git
roland watch --interval 30                      # poll every 30s (default: 60)
roland watch --once                             # run once on first change, exit
roland watch --notify --webhook https://ntfy.sh/alerts
```

### `roland pr`

```bash
roland pr 42                                    # review PR #42
roland pr                                       # auto-detect from current branch
roland pr 42 --fix                              # review + commit + push fixes
roland pr 42 --fix --branch fix/pr-42           # fixes on a named branch
roland pr 42 --notify
```

---

## How it works

```
You type a goal
      ↓
Lead PM (Claude Opus 4.7)
  • reads project memory from prior runs
  • reads Blackboard (shared state)
  • decomposes into parallel tasks
      ↓
Wave 1 — parallel execution
  executor        → implements the feature
  architect       → reviews design
  test-author     → writes tests
      ↓
PM reviews wave — continue or adjust (spawn / unblock / re-scope)
      ↓
Wave 2 — test-executor, code-reviewer, doc-writer…
      ↓
PM synthesises → executive-ready deliverable printed to stdout
  + .roland/memory.md updated with decisions / patterns / avoid list
  + notification fired (desktop / webhook)
```

**Persistence** (all in `.roland/`):

| File | Contents |
|------|----------|
| `blackboard.json` | Shared task context — results, blockers, messages |
| `memory.md` | Cross-run knowledge — tech stack, patterns, things to avoid |
| `run-state.json` | Live state for `roland status` observer |
| `messages.json` | Agent-to-agent message bus |

---

## Install & Build

```bash
git clone https://github.com/AdamMcIntosh/roland.git
cd roland
npm install
npm run build
npm link          # makes `roland` available globally
```

**Verify:**
```bash
roland doctor
```

**Required env:**
```bash
export CURSOR_API_KEY=<your-key>   # required for agent execution
export ROLAND_NOTIFY=1             # optional: enable notifications globally
```

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CURSOR_API_KEY` | _(required)_ | API key for agent execution |
| `ROLAND_NOTIFY` | `0` | Set to `1` to enable notifications for all commands |
| `ROLAND_AGENT_TIMEOUT_MS` | `1500000` (25 min) | Per-agent hard timeout |
| `ROLAND_AGENT_RETRIES` | `2` | Max retries before synthetic BLOCKER |

---

## Roland API

Minimal Fastify HTTP server — read-only JSON endpoints plus optional Stripe payments and OAuth2 login.

### Prerequisites

- **Node.js 20 LTS** (minimum **18.0.0** per `package.json` `engines`)

### Install

```bash
npm install
```

### Development

```bash
npm run api:dev
```

Hot-reloads `src/server.ts` (tsx watch). Pretty logging when `NODE_ENV` is not `production`.

### Build

```bash
npm run build
```

Compiles TypeScript to `dist/` (includes `dist/server.js`).

### Start

```bash
npm run api:start
```

Runs `node dist/server.js`. Build first.

> **Note:** `npm run api:dev` and `npm run api:start` serve the HTTP API. Roland's top-level `dev` and `start` scripts target the MCP/RCO CLI.

### Test

```bash
npm test
```

Runs the Vitest suite (includes `tests/routes/`). For route tests only: `npm run api:test`.

### Environment variables

| Variable | Default   | Description                          |
|----------|-----------|--------------------------------------|
| `PORT`   | `3000`    | HTTP listen port                     |
| `HOST`   | `0.0.0.0` | Bind address                         |

Stripe payment integration adds `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, and `STRIPE_API_VERSION` — see [Stripe Payments Guide](docs/guides/stripe-payments.md) for setup, env vars, and the payment API.

OAuth2 login adds `SESSION_SECRET`, `APP_BASE_URL`, and provider credentials — see [OAuth2 Login Guide](docs/guides/oauth2.md) (summary below).

### Try it

Start the server (`npm run build && npm run api:start`), then:

```bash
curl -s http://localhost:3000/hello
# {"message":"Hello, World!"}

curl -s "http://localhost:3000/hello?name=Alice"
# {"message":"Hello, Alice!"}

curl -s http://localhost:3000/health
# {"status":"ok","uptime":12.345,"timestamp":"2026-05-25T12:00:00.000Z"}
```

`uptime` (seconds) and `timestamp` (ISO 8601) vary at runtime; `status` is always `"ok"`.

---

## OAuth2 Login

Sign in with **Google** or **GitHub** using Authorization Code flow + PKCE. Sessions are encrypted server-side cookies (`@fastify/secure-session`); OAuth access tokens are never returned to clients.

Auth routes register when `SESSION_SECRET` and `APP_BASE_URL` are set (same pattern as Stripe). The default `src/server.ts` entry point also requires Stripe env vars — copy the full [`.env.example`](.env.example).

### Quick start

```bash
cp .env.example .env
# Generate SESSION_SECRET:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# Set GOOGLE_* / GITHUB_* credentials (see guide for provider console URLs)
npm run api:dev
```

Open `http://localhost:3000/auth/login/google` (or `/auth/login/github`) in a browser. After login you are redirected to `/` (or your `?returnTo=` path).

### Auth endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/auth/login/:provider` | Start OAuth (`google` or `github`); optional `?returnTo=/path` |
| `GET` | `/auth/callback/:provider` | Provider callback (browser redirect only) |
| `GET` | `/auth/me` | Current user JSON (requires session cookie) |
| `POST` | `/auth/logout` | Destroy session (`204 No Content`) |

### curl examples

Save session cookies after browser login to `cookies.txt`, then:

```bash
curl -s -b cookies.txt http://localhost:3000/auth/me
# {"id":"…","email":"you@example.com","emailVerified":true,"displayName":"…","avatarUrl":"…","providers":["google"],"createdAt":"…"}

curl -s -X POST -b cookies.txt http://localhost:3000/auth/logout -w "\nHTTP %{http_code}\n"
# HTTP 204
```

Without a session, `/auth/me` returns `401` with `{"error":"Unauthorized","message":"Authentication required","code":"unauthenticated"}`.

### Further reading

| Doc | Contents |
|-----|----------|
| [OAuth2 Login Guide](docs/guides/oauth2.md) | Setup, provider registration, local dev walkthrough, tests, security, troubleshooting |
| [OAuth2 Operational Runbook](docs/guides/oauth2-runbook.md) | Env matrix, secret rotation, CI fixtures, deploy checklist |
| [`.env.example`](.env.example) | All auth-related variables with placeholders |

---

## 🧑‍💼 PM Team Mode (Cursor)

Roland can also run as a **PM-first multi-agent team** inside Cursor. You are the
Lead PM (on Claude Opus 4.7); Roland runs a team of specialized engineers on
Cursor's Composer 2.5 models. You don't write code — you decompose work,
delegate it, and **keep the team unblocked**.

> **The mantra:** *I am the PM. Roland runs the team. Keep them unblocked.*

**Setup (global, works in every project):**
```bash
bash scripts/install-global.sh    # Windows: pwsh scripts/install-global.ps1
roland doctor                      # verify
```

**The loop**, in Cursor chat:
1. `get_pm_playbook` — adopt the PM posture.
2. `pm_standup` — read the rendered board (blockers always on top).
3. `unblock_task` → `review_task` → `assign_task` / `start_team_recipe`.
4. Each dispatch packet has a **`cursorLaunch`** block — copy-paste steps to spin
   up the engineer in a new Cursor pane on the right model.
5. `synthesize_deliverable` when the board is clear.

**Routing** is deterministic and Cursor-native (no OpenRouter): PM →
`claude-opus-4-7`; reasoning roles (architect, reviewer, critic) →
`composer-2.5-fast`; execution (executor, qa, docs) → `composer-2.5-standard`.
Token usage is attributed per engineer/task (figures are usage, not dollars —
the team runs on your Cursor subscription).

→ **New here? Start with [`ONBOARDING.md`](ONBOARDING.md).**
→ **Full worked example: [`docs/guides/pm-workflow.md`](docs/guides/pm-workflow.md).**

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
| test-author | Test strategy & authoring |
| test-executor | Test execution & triage |
| writer | Documentation & technical writing |
| analyst | Data & trend analysis |
| vision | Technical strategy & long-term planning |
| scientist | Data analysis & hypothesis testing |
| security-reviewer | Security auditing & hardening |
| build-fixer | Build error resolution |
| code-reviewer | Comprehensive code review |
| tdd-guide | Test-driven development guidance |

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
| **DesktopApp** | Architect → Designer → Executor → test-author → test-executor → Critic → Writer | Desktop/native app development |
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

**Bash** (macOS / Linux / Git Bash on Windows):
```bash
curl -fsSL https://raw.githubusercontent.com/AdamMcIntosh/roland/main/scripts/setup.sh | bash
```

**PowerShell** (Windows):
```powershell
irm https://raw.githubusercontent.com/AdamMcIntosh/roland/main/scripts/setup.ps1 | iex
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
# 2. Run one-command setup (handles clone + build + Goose config + init)
# Bash:
curl -fsSL https://raw.githubusercontent.com/AdamMcIntosh/roland/main/scripts/setup.sh | bash
# PowerShell:
# irm https://raw.githubusercontent.com/AdamMcIntosh/roland/main/scripts/setup.ps1 | iex

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
| [CLAUDE.md](CLAUDE.md) | Developer guide — architecture, model routing, agent conventions, pitfalls |
| [INSTALLATION.md](INSTALLATION.md) | Setup, IDE configuration, project portability |
| [Goose User Guide](docs/guides/goose-user-guide.md) | Goose setup, model tiers, budget management, recipes |
| [Roland vs Claude Code](docs/guides/comparison-claude-code.md) | Honest quality comparison, enterprise workflow, cost analysis |
| [TESTING.md](TESTING.md) | Automated tests (Vitest), manual IDE tests, QA scenarios, benchmarks |
| [RECIPES_CATALOG.md](RECIPES_CATALOG.md) | Complete recipe reference with agent chains |
| [CHANGELOG.md](CHANGELOG.md) | Version history (Keep a Changelog format) |
| [ROADMAP.md](ROADMAP.md) | v0.1 checklist, v0.2 sprints, v1.0 vision |
| [docs/guides/budget-guide.md](docs/guides/budget-guide.md) | Cost management & spending limits |
| [docs/guides/cache-guide.md](docs/guides/cache-guide.md) | Caching strategies |
| [Stripe Payments Guide](docs/guides/stripe-payments.md) | Stripe setup, env vars, Checkout Sessions flow, payment API, webhooks, testing |
| [OAuth2 Login Guide](docs/guides/oauth2.md) | Google/GitHub login, sessions, endpoints, local dev, security, troubleshooting |
| [OAuth2 Operational Runbook](docs/guides/oauth2-runbook.md) | Env matrix, provider callbacks, secret rotation, CI, deploy checklist |

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
npm run qa:all          # RCO QA: all scenarios; timings vs baseline benchmarks
npm test                # Run tests (watch)
npm run test:run        # Run tests once
npm run test:rco        # RCO tests only (orchestrator, loadConfig, stateLock, tools)
npm run serve-dashboard # Serve dashboard-ui on port 8081
npm run benchmark       # RCO benchmark: sample tasks vs simulated baseline
npm run lint            # Lint check
npm run clean           # Remove dist/
npm start               # Start MCP server directly
```

---

## License

MIT
