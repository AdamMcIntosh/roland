# Roland + Goose User Guide

> Smart model routing for Goose — the right model for every task, on a budget.

## What is Roland?

Roland is an MCP extension that makes Goose smarter about model selection. Instead of running everything on one model, Roland analyzes each task and routes it to the best model for the job — expensive models for architecture and security, cheap models for implementation, free models for docs.

## How It Works

```
You type a prompt
  → Goose main session (Gemini 2.5 Flash — routing + file edits)
    → Calls Roland's triage tool
    → Roland analyzes: keywords, complexity, budget status
    → Returns: recommended model + agent persona + instructions
  → For text-only steps (plan, review): spawns subagent on recommended model
  → For file-editing steps (execute, fix): main session does it directly
  → Result returned to you
```

You don't need to think about which model to use. Roland handles it.

**Why hybrid?** Subagents can't edit files — they don't have developer extension
access. The main session (Gemini 2.5 Flash) handles all file operations, while
subagents on more capable models (Sonnet 4, Gemini Pro) handle planning and review.

## Setup

### Prerequisites

- [Goose](https://block.github.io/goose/) installed
- [OpenRouter](https://openrouter.ai/) account with API key
- Roland built (`npm install && npm run build`)

### 1. Configure Goose

Copy the template or merge into your existing config:

```bash
cp roland/goose/config.yaml ~/.config/goose/config.yaml
```

Edit `~/.config/goose/config.yaml` — update the Roland path:

```yaml
GOOSE_PROVIDER: openrouter
GOOSE_MODEL: google/gemini-2.0-flash

extensions:
  roland:
    type: stdio
    cmd: "node"
    args:
      - "/your/path/to/roland/dist/index.js"
    enabled: true
    timeout: 300
```

### 2. Set your API key

```bash
export OPENROUTER_API_KEY=sk-or-...your-key...
```

### 3. Set your budget

Start a Goose session and set your monthly budget:

```
> Use the manage_budget tool with action "set_limit" and daily_limit 2.50
```

That's $2.85/day = ~$85/month. Roland will automatically switch to free models when you hit 80% ($68).

### 4. Verify

```
> Use the health_check tool
```

You should see `status: healthy` and a list of 10 tools.

## Daily Usage

### Just prompt normally

```
> Fix the null check in auth.ts line 42
```

Roland triages this as a simple bug fix → spawns one subagent on DeepSeek V3 (cheap, good coder) → done.

```
> Design a microservices architecture for our payment system
```

Roland triages this as complex architecture → spawns architect subagent on Claude Sonnet 4 (best reasoning) → returns detailed design.

### Use recipes for big tasks

For multi-step work, Roland recommends recipes — multi-agent workflows where each step runs on the right model:

```
> Build a REST API for managing tasks with JWT authentication
```

Roland suggests the PlanExecRevEx recipe. If you agree:

1. **Planner** (Gemini 2.5 Pro) breaks the task into steps
2. **Executor** (DeepSeek V3) implements the code
3. **Reviewer** (Gemini 2.5 Pro) checks for bugs and issues
4. **Explainer** (Gemini 2.5 Flash) summarizes what was built

Cost: ~$0.08 per recipe run.

### Available recipes

| Recipe | Steps | Best for |
|--------|-------|----------|
| **PlanExecRevEx** | Plan → Execute → Review → Explain | New features, full implementations |
| **BugFix** | Triage → Research → Architect → Fix → Test → Review → Document | Multi-file bugs, root cause unknown |
| **SecurityAudit** | Threat Model → Code Review → Remediate → Document | Security reviews, compliance |

Run a recipe directly:

```bash
goose run --recipe goose/recipes/roland-plan-exec-rev-ex.yaml --task "Build a todo app"
```

## When to Use Roland vs. Your IDE

Roland isn't meant for every task. Use the right tool:

| Task | Use | Why |
|------|-----|-----|
| Typo, rename, one-liner | **Windsurf / Cursor** | Direct edit, no cost |
| Small bug fix (single file) | **Windsurf / Cursor** | One LLM call is enough |
| Simple refactor | **Windsurf / Cursor** | IDE agent handles it fine |
| Multi-file bug, root cause unknown | **Roland** | Multi-agent BugFix recipe |
| Architecture, system design | **Roland** | Routes to Sonnet 4 |
| Security audit | **Roland** | Multi-step SecurityAudit recipe |
| New feature (plan → build → review) | **Roland** | PlanExecRevEx recipe |

**Rule of thumb**: If your IDE agent can do it in one shot, use your IDE. If you need planning, review, or multiple perspectives, use Roland.

This keeps ~70% of your work off the OpenRouter budget.

## Model Tiers

Roland uses five model tiers, optimized for an $85/month budget:

| Tier | Model | Cost/1M tokens | Used for |
|------|-------|---------------|----------|
| **Critical** | `anthropic/claude-sonnet-4` | $3 / $15 | Architecture, security — wrong answers here are expensive to redo |
| **High-value** | `google/gemini-2.5-pro` | $1.25 / $10 | Planning, code review — thoroughness over speed |
| **Workhorse** | `deepseek/deepseek-chat` (V3) | $0.27 / $1.10 | Implementation, testing — best coding per dollar |
| **Light** | `google/gemini-2.5-flash` | $0.15 / $0.60 | Docs, exploration, explanations |
| **Main session** | `google/gemini-2.5-flash` | $0.15 / $0.60 | Routing + file edits (your primary model) |

### Tiered agent variants

Most agents have `-low` and `-high` variants:

- `executor-low` → Gemini Flash (cheaper, simpler tasks)
- `executor` → DeepSeek V3 (default)
- `executor-high` → Gemini 2.5 Pro (more capable, costs more)

Roland picks the right variant based on complexity.

## Budget Management

### Set a budget

```
> Use manage_budget with action "set_limit" and daily_limit 2.50
```

### Check spending

```
> Use manage_budget with action "get_status"
```

### View cost breakdown

```
> Use get_analytics with group_by "model"
```

### What happens at 80%

When you hit 80% of your budget, Roland automatically switches all agents to free models:

| Normal model | Degraded to | Quality impact |
|-------------|-------------|----------------|
| `anthropic/claude-sonnet-4` | `nvidia/nemotron-3-super-120b-a12b:free` | Good reasoning, slightly less precise |
| `google/gemini-2.5-pro` | `nvidia/nemotron-3-super-120b-a12b:free` | Same |
| `deepseek/deepseek-chat` | `qwen/qwen3-coder:free` | Comparable coding quality |
| `google/gemini-2.5-flash` | `mistralai/mistral-small-3.1-24b-instruct:free` | Similar speed, good enough |

All free models support tool calling and have 128K+ context. You can keep working — quality drops slightly but you never overshoot your budget.

### Reset at month start

```
> Use manage_budget with action "reset"
```

## Cost Estimates

### Monthly forecast

| Usage level | Tasks/day | Tokens/month | Cost |
|-------------|-----------|-------------|------|
| Light | 5 | ~8M | **~$12** |
| Moderate | 10 | ~15M | **~$23** |
| Heavy | 20 | ~30M | **~$46** |

### Per recipe run

| Recipe | Cost |
|--------|------|
| PlanExecRevEx (4 steps) | ~$0.08 |
| BugFix (7 steps) | ~$0.14 |
| SecurityAudit (4 steps) | ~$0.30 |

At moderate usage: ~500 recipe runs/month within $85 budget.

## Available Tools

| Tool | What it does |
|------|-------------|
| `triage` | Analyze your prompt → recommend agent + model + recipe |
| `route_model` | Get complexity analysis and model recommendation |
| `track_cost` | Log token usage after LLM calls |
| `manage_budget` | Set/check/reset spending limits |
| `get_analytics` | Cost breakdowns by model, agent, or provider |
| `suggest_mode` | Should this be quick, standard, or deep? |
| `list_recipes` | Browse available workflow recipes |
| `start_recipe` | Begin a multi-agent recipe |
| `advance_recipe` | Move to next recipe step |
| `health_check` | Server status |

## Agent Catalog

Roland has 44 agent personas. The most commonly used:

| Agent | Specialty | Default model |
|-------|-----------|---------------|
| **architect** | System design, component diagrams, trade-offs | Claude Sonnet 4 |
| **executor** | Write clean, working code | DeepSeek V3 |
| **planner** | Break tasks into actionable steps | Gemini 2.5 Pro |
| **critic** | Code review, find bugs, improvements | Gemini 2.5 Pro |
| **security-reviewer** | Vulnerability scanning, OWASP, hardening | Claude Sonnet 4 |
| **qa-tester** | Write and run tests, edge cases | DeepSeek V3 |
| **researcher** | Codebase exploration, root cause investigation | DeepSeek V3 |
| **writer** | Technical docs, README, API docs | Gemini 2.5 Flash |
| **build-fixer** | TypeScript errors, CI/CD issues | DeepSeek V3 |
| **designer** | UI/UX, component layout, accessibility | DeepSeek V3 |

Full list: see `agents/*.yaml` in the Roland repo.

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Roland tools not appearing in `/tools` | Check extension path in Goose config, rebuild Roland |
| `health_check` fails | Verify `dist/index.js` exists (`npm run build`) |
| Subagent uses wrong model | Check budget status — may be in degraded mode |
| Free models returning errors | Free models can be rate-limited; try again or check OpenRouter status |
| High costs | Set a budget with `manage_budget`, use IDE agent for simple tasks |
| Recipe stuck | Check `advance_recipe` — pass `session_id` and `step_output` |

## Tips

1. **Set your budget on day one.** `manage_budget` → `set_limit`. The 80% auto-degradation protects you.
2. **Use your IDE for small stuff.** Typos, one-liners, simple fixes — don't burn OpenRouter tokens.
3. **Let triage decide.** Don't manually pick models. Roland's routing is cheaper and usually right.
4. **Check analytics weekly.** `get_analytics` shows where your tokens go. Adjust if one agent is burning too much.
5. **Reset monthly.** `manage_budget` → `reset` at the start of each billing cycle.
