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

Roland triages this as simple (`execution_strategy.mode = "main_session_direct"`) → Flash fixes it directly → done. Cost: ~$0.01.

```
> Design a microservices architecture for our payment system
```

Roland triages this as complex → spawns architect subagent on Sonnet 4 → returns detailed design. Cost: ~$0.15.

```
> Implement a payment service with Stripe webhooks and idempotency
```

Roland triages this as complex (`execution_strategy.mode = "subagent_writes_code"`) → spawns Sonnet 4 subagent to write the code → main session applies files to disk → runs tests. If tests fail, spawns another Sonnet 4 subagent with full error output + file contents → applies fix. Cost: ~$0.15-0.30.

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

Roland uses smart triage to route each task to the right model, optimized for an $85/month budget:

| Tier | Model | Cost/1M tokens | Used for |
|------|-------|---------------|----------|
| **Complex code + thinking** | `anthropic/claude-sonnet-4` | $3 / $15 | Code authoring (complex), architecture, security, planning, review — 40% of traffic, 94% of spend |
| **Medium text tasks** | `deepseek/deepseek-chat` (V3) | $0.27 / $1.10 | Text-only subagents for medium complexity |
| **Main session + light** | `google/gemini-2.5-flash` | $0.15 / $0.60 | Routing, file I/O, simple code, docs, exploration |

### Smart triage execution strategy

Roland's `triage` tool returns an `execution_strategy` that determines how code gets written:

| Complexity | Strategy | Who writes code | Quality |
|-----------|----------|----------------|---------|
| Simple/medium | `main_session_direct` | Flash (main session) | B+ |
| Complex | `subagent_writes_code` | Sonnet 4 (subagent) | A+ |

For complex tasks, Sonnet 4 writes complete, production-ready code. The main session
(Flash) just applies it to files. This gives you A+ code quality on complex enterprise
work without paying Sonnet 4 prices for every small edit.

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

### What happens at 80% ($68)

When you hit 80% of your budget, Roland automatically switches all agents to free models:

| Normal model | Degraded to | Quality impact |
|-------------|-------------|----------------|
| `anthropic/claude-sonnet-4` | `nvidia/nemotron-3-super-120b-a12b:free` | Good reasoning, slightly less precise |
| `deepseek/deepseek-chat` | `qwen/qwen3-coder:free` | Comparable coding quality |
| `google/gemini-2.5-flash` | `mistralai/mistral-small-3.1-24b-instruct:free` | Similar speed, good enough |

All free models support tool calling and have 128K+ context. You can keep working — quality drops but you never overshoot your budget. The `execution_strategy` will also switch to `main_session_direct` to avoid spawning paid subagents.

### Reset at month start

```
> Use manage_budget with action "reset"
```

## Cost Estimates

### Monthly forecast

| Usage level | Tasks/day | Tokens/month | Cost | Headroom ($85) |
|-------------|-----------|-------------|------|----------------|
| Light | 5 | ~8M | **~$27** | $58 |
| Moderate | 10 | ~15M | **~$50** | $35 |
| Heavy | 20 | ~30M | **~$80** | $5 |

~94% of spend goes to Sonnet 4 subagents (complex code + thinking). Everything else is cheap plumbing.

### Per recipe run

| Recipe | Models used | Cost |
|--------|-----------|------|
| PlanExecRevEx (4 steps) | Sonnet 4 ×2, Flash ×2 | ~$0.15 |
| BugFix (7 steps) | Sonnet 4 ×3, Flash ×3, DeepSeek ×1 | ~$0.25 |
| SecurityAudit (4 steps) | Sonnet 4 ×2, DeepSeek ×1, Flash ×1 | ~$0.35 |

At moderate usage: ~400 recipe runs/month within $85 budget.

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

| Agent | Specialty | Simple tasks | Complex tasks |
|-------|-----------|-------------|---------------|
| **architect** | System design, trade-offs | Sonnet 4 (subagent) | Sonnet 4 (subagent) |
| **executor** | Write clean, working code | Flash (main session) | Sonnet 4 writes → Flash applies |
| **planner** | Break tasks into steps | Sonnet 4 (subagent) | Sonnet 4 (subagent) |
| **critic** | Code review, improvements | Sonnet 4 (subagent) | Sonnet 4 (subagent) |
| **security-reviewer** | Vulnerability scanning | Sonnet 4 (subagent) | Sonnet 4 (subagent) |
| **qa-tester** | Tests, edge cases | Flash (main session) | Sonnet 4 writes → Flash applies |
| **researcher** | Root cause investigation | DeepSeek (subagent) | Sonnet 4 (subagent) |
| **writer** | Docs, README, API docs | Flash (main session) | Flash (main session) |
| **build-fixer** | Build errors, CI/CD | Flash (main session) | Sonnet 4 writes → Flash applies |
| **designer** | UI/UX, components | Flash (main session) | Sonnet 4 writes → Flash applies |

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
