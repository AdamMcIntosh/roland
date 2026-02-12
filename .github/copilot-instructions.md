# Samwise Project Instructions

This project uses **Samwise** — an AI agent orchestration framework — to provide specialized agent personas and multi-agent workflow recipes.

## Available Agents

Use the specialized agent files in `.github/agents/` by mentioning them with `@agent-name`. Each agent has a focused role:

| Agent | Role | Best For |
|-------|------|----------|
| architect | System design & architecture | Design decisions, component diagrams, trade-off analysis |
| researcher | Information gathering | Codebase exploration, documentation analysis, root cause investigation |
| executor | Implementation & coding | Writing code, making changes, fixing bugs |
| designer | UI/UX design | Component design, user flows, accessibility |
| planner | Task breakdown | Breaking complex tasks into actionable steps |
| critic | Code review & validation | Finding bugs, security issues, improvements |
| qa-tester | Quality assurance | Writing and running tests, coverage analysis |
| writer | Documentation | Technical writing, README updates, API docs |
| security-reviewer | Security auditing | Vulnerability scanning, OWASP checks, hardening |
| build-fixer | Build error resolution | TypeScript errors, configuration issues, CI failures |
| code-reviewer | Code review | Comprehensive review with best practices |
| tdd-guide | Test-driven development | Red-green-refactor cycle guidance |
| scientist | Data analysis | Statistics, ML, hypothesis testing |
| explore | Codebase navigation | Mapping project structure, finding patterns |
| analyst | Data & trend analysis | Metrics, trends, quantitative analysis |
| vision | Technical strategy | Long-term planning, technology evaluation |

Most agents have tiered variants (`-low`, `-medium`, `-high`) for different depth levels.

## Available Recipe Workflows

Recipe chains are multi-agent workflows available as handoff agent chains:

| Recipe | Agents | Description |
|--------|--------|-------------|
| PlanExecRevEx | Planner → Executor → Reviewer → Explainer | 4-agent autonomous coding loop |
| BugFix | Analyst → Researcher → Architect → Executor → QA → Critic → Writer | Systematic bug resolution |
| RESTfulAPI | Architect → Executor → Critic → Writer | API design through documentation |
| SecurityAudit | Architect → Critic → Executor → Writer | Threat modeling to remediation |
| WebAppFullStack | Architect → Designer → Executor → Critic → Writer | Full-stack development |
| MicroservicesArchitecture | Architect → Executor → Critic → Writer | Service decomposition |
| DocumentationRefactor | Analyst → Architect → Writer → Critic | Codebase-aware doc improvement |

To start a recipe, invoke the first agent in the chain (e.g., `@plan-exec-rev-ex-planner`).

## Samwise MCP Server

If configured, the Samwise MCP server provides these tools:

| Tool | Purpose | When to Use |
|------|---------|-------------|
| `health_check` | Server status & uptime | Verify server is running |
| `route_model` | Complexity analysis → cheapest adequate model | Before making an LLM request |
| `track_cost` | Log token usage, return session totals | After each LLM interaction |
| `manage_budget` | Get/set/reset spending limits | Enforce cost controls |
| `get_analytics` | Cost & token breakdowns by model/agent/provider | Review session spending |
| `suggest_mode` | Recommend quick/standard/deep depth | Decide effort level for a task |
| `list_recipes` | Available workflow recipes | Browse available multi-agent workflows |
| `execute_recipe` | Run a multi-agent recipe | Execute BugFix, RESTfulAPI, SecurityAudit, etc. |
| `get_cache_stats` | Workflow cache hit rate & memory | Monitor caching efficiency |
