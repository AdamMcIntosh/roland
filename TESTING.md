# Testing Guide

Step-by-step guide for verifying the Roland MCP server in Cursor.

## Prerequisites

```bash
npm install
npm run build
```

Open the project in Cursor and confirm the server is connected at **Settings → MCP** — `roland` should show a green status.

## 1. Health Check

In Cursor chat:

```
Use the health_check tool
```

**Expected**: `status: healthy`, uptime in seconds, and a list of 9 available tools:
`health_check`, `route_model`, `track_cost`, `manage_budget`, `get_analytics`, `suggest_mode`, `list_recipes`, `start_recipe`, `advance_recipe`

If this fails, rebuild (`npm run build`) and restart Cursor.

## 2. List Recipes

```
Use the list_recipes tool
```

**Expected**: 7 recipes returned — PlanExecRevEx, BugFix, RESTfulAPI, SecurityAudit, WebAppFullStack, MicroservicesArchitecture, DocumentationRefactor. Each shows name, description, and agent steps.

## 3. Start a Recipe

```
Use the start_recipe tool with recipe "PlanExecRevEx" and task "Add input validation to the user registration endpoint"
```

**Expected**: Returns a session ID and the first step prompt (Planner). The prompt should include your task description interpolated into it.

## 4. Advance the Recipe

Copy the Planner's output and pass it back:

```
Use the advance_recipe tool with session_id "<session_id_from_step_3>" and step_output "<paste the planner output here>"
```

**Expected**: Returns the next step prompt (Executor). Repeat for Reviewer and Explainer. After the final step, you get a summary with all step outputs.

## 5. Route Model

```
Use the route_model tool with query "Fix a typo in the README"
```

**Expected**: Returns a model recommendation based on query complexity (simple → cheap model, complex → capable model).

Try again with a complex query:

```
Use the route_model tool with query "Design a distributed event-sourcing system with CQRS, saga orchestration, and multi-region failover"
```

**Expected**: Routes to a more capable model.

## 6. Suggest Mode

```
Use the suggest_mode tool with task "rename a variable"
```

**Expected**: Recommends `quick` mode.

```
Use the suggest_mode tool with task "architect a new microservices platform with CI/CD pipelines"
```

**Expected**: Recommends `deep` mode.

## 7. Budget Management

```
Use the manage_budget tool with action "get_budget"
```

**Expected**: Returns current budget status (limit, spent, remaining).

```
Use the manage_budget tool with action "set_limit" and daily_limit 5.00
```

**Expected**: Confirms new daily limit set to $5.00.

## 8. Cost Tracking

```
Use the track_cost tool with model "gpt-4" and input_tokens 1000 and output_tokens 500
```

**Expected**: Records the cost and returns session totals.

```
Use the get_analytics tool
```

**Expected**: Returns cost breakdowns by model. Shows the cost entry you just recorded.

## 9. Full Recipe Walkthrough

For a complete end-to-end test, run through an entire recipe:

1. `start_recipe` with "BugFix" and a real bug description
2. Execute the Analyst prompt — paste the output into `advance_recipe`
3. Execute the Researcher prompt — paste output into `advance_recipe`
4. Continue through Architect → Executor → QA-Tester → Critic → Writer
5. After the Writer step, `advance_recipe` returns a summary of all 7 steps

This confirms the full session lifecycle: creation, multi-step advancement, variable interpolation, and summary generation.

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Server not showing in Settings → MCP | Rebuild (`npm run build`), restart Cursor |
| `Cannot find module 'dist/index.js'` | Run `npm run build` |
| Tools not appearing in chat | Check `.cursor/mcp.json` exists and points to `dist/index.js` |
| Recipe not found | Check `recipes/` directory has the YAML file |
| Session expired | Sessions expire after 1 hour — start a new one |

## After Changes

When you modify source files:

```bash
npm run build
```

Then restart the MCP server in Cursor: **Settings → MCP → roland → Restart**.
