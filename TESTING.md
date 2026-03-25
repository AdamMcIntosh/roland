# Testing Guide

Roland has two testing surfaces: **automated tests** (Vitest) for the codebase, and **manual IDE tests** for verifying the MCP server in Cursor/VS Code.

---

## Automated Tests

### Prerequisites

```bash
npm install
npm run build
```

### Run All Tests

```bash
npm run test:run
```

Runs the full suite (11 test files, 90 tests). Requires a fresh build — the fork-based integration tests use compiled workers from `dist/`.

### Test Commands

| Command | Scope |
|---------|-------|
| `npm test` | Watch mode (re-runs on changes) |
| `npm run test:run` | Single run, all tests |
| `npm run test:rco` | RCO orchestrator tests only |
| `npm run test:e2e` | E2E tests only (install, telemetry, release, workflow) |
| `npm run test:coverage` | Full run with V8 coverage report |

### Test Structure

```
tests/
├── unit/
│   └── ecomode.test.ts          # Complexity classifier, model router, cost tracker
├── integration/
│   └── mcp-tools.test.ts        # RCO skills (eco-optimizer, graph-visualizer), stub tools
├── integration.test.ts          # Config → router → cost pipeline end-to-end
├── rco/
│   ├── orchestrator.test.ts     # loadConfig, stateLock, tools, orchestrator (mock + real fork)
│   └── phase2.test.ts           # Plugin commands, persistence, schemas, export, dashboard
├── phase3.test.ts               # adaptive-swarm, skills, customization, plugin modes
└── e2e/
    ├── workflow-execution.test.ts    # Recipe session lifecycle, loops, cost tracking
    ├── phase4-install.test.ts        # Install script validation
    ├── phase4-telemetry.test.ts      # Consent, init, capture
    ├── phase4-release.test.ts        # Build output validation
    └── phase4-beta-feedback.test.ts  # Issue schema validation
```

### What Each Suite Covers

**Unit — `ecomode.test.ts`** (11 tests)
- Complexity classification: short queries → simple, long queries → higher scores
- Model router: `analyzeQueryComplexity`, `routeByComplexity`, pricing data
- Cost tracker: record, summarize, clear, provider-level breakdown

**Integration — `mcp-tools.test.ts`** (7 tests)
- `ecoOptimizerSuggestModel`: Haiku for short prompts, Sonnet for complex
- `graphVisualizerDOT`: valid DOT output from state and workflow steps
- Stub tools: `search`, `code`, unknown tool handling

**Integration — `integration.test.ts`** (5 tests)
- Full pipeline: `loadConfig` → `ComplexityClassifier` → `ModelRouter.routeByComplexity` → `AdvancedCostTracker`
- Score monotonicity across increasing complexity levels

**RCO — `orchestrator.test.ts`** (17 tests)
- YAML loading: agents, recipes, config, error cases
- State locking: acquire/release, read/write, missing file handling
- Tools: dependency-mapper DOT output, known/unknown tool dispatch
- Orchestrator (mock worker): runs PlanExecRevEx, persists state, respects timeout/retries
- Orchestrator (real fork): full end-to-end with `child_process.fork`
- Cursor export: writes `.cursor/rules` and MCP JSON

**RCO — `phase2.test.ts`** (19 tests)
- Plugin: command list, arg parsing, status handler, `runRecipeFromPlugin` end-to-end
- Schemas: JSON extraction, fallback, Zod validation
- Persistence: notepad prompts, local save/load round-trip, session listing
- Export: dynamic triage rules from session outputs
- Dashboard: `broadcastGraph`, `startDashboard`/`stopDashboard`
- Prompts: Claude tool-calling prompt content

**Phase 3 — `phase3.test.ts`** (10 tests)
- `adaptive-swarm`: step count scales with task complexity
- Skills: eco-optimizer model selection, graph-visualizer DOT output
- Customization: `generateAndSaveCustomAgent` creates YAML

**E2E — `workflow-execution.test.ts`** (6 tests)
- `RecipeSessionManager`: start session, advance through steps, summary generation
- Cost tracking through sessions, concurrent sessions, loop recipes

**E2E — Phase 4 tests** (14 tests total)
- `phase4-install.test.ts`: install.sh exists and contains expected patterns
- `phase4-telemetry.test.ts`: consent read/write, init safety, capture safety
- `phase4-release.test.ts`: build produces expected dist/ and plugin outputs
- `phase4-beta-feedback.test.ts`: issue schema validation with Zod

### Coverage

Coverage thresholds are configured in `vitest.config.ts`:

| Metric | Threshold |
|--------|-----------|
| Statements | 80% |
| Branches | 70% |
| Functions | 80% |
| Lines | 80% |

Run `npm run test:coverage` to generate a report. Coverage includes all files in `src/` except `src/rco/fixtures/`.

### QA Scenarios

For broader scenario-based validation with mock workers:

```bash
npm run qa                    # Single scenario (todo-app)
npm run qa:all                # All 10 scenarios with baseline timing comparison
```

### Benchmarks

```bash
npm run benchmark             # Run 3 sample tasks, report timing vs simulated baseline
```

---

## Manual IDE Testing

Step-by-step verification of the MCP server in Cursor (or VS Code with Copilot).

### Setup

1. Build: `npm run build`
2. Open the project in Cursor
3. Confirm the server is connected: **Settings → MCP** — `roland` should show green

### 1. Health Check

In Cursor chat:

```
Use the health_check tool
```

**Expected**: `status: healthy`, uptime in seconds, list of available tools.

### 2. List Recipes

```
Use the list_recipes tool
```

**Expected**: 9 recipes returned (PlanExecRevEx, BugFix, RESTfulAPI, SecurityAudit, WebAppFullStack, MicroservicesArchitecture, DocumentationRefactor, DesktopApp, CodeReviewCompliance).

### 3. Start and Advance a Recipe

```
Use the start_recipe tool with recipe "PlanExecRevEx" and task "Add input validation to the user registration endpoint"
```

**Expected**: Returns session ID and first step prompt (Planner).

Copy the Planner output and pass it back:

```
Use the advance_recipe tool with session_id "<id>" and step_output "<planner output>"
```

Repeat through Executor → Reviewer → Explainer. After the final step, `advance_recipe` returns a summary.

### 4. Route Model

```
Use the route_model tool with query "Fix a typo in the README"
```

**Expected**: Recommends a cost-effective model for a simple query.

```
Use the route_model tool with query "Design a distributed event-sourcing system with CQRS and saga orchestration"
```

**Expected**: Recommends a more capable model.

### 5. Suggest Mode

```
Use the suggest_mode tool with task "rename a variable"
```

**Expected**: Recommends `quick` mode.

```
Use the suggest_mode tool with task "architect a new microservices platform"
```

**Expected**: Recommends `deep` mode.

### 6. Budget and Cost

```
Use the manage_budget tool with action "get_budget"
```

**Expected**: Current budget status.

```
Use the track_cost tool with model "gpt-4" and input_tokens 1000 and output_tokens 500
```

**Expected**: Records cost, returns session totals.

```
Use the get_analytics tool
```

**Expected**: Cost breakdowns by model showing the recorded entry.

### 7. RCO CLI Smoke Test

```bash
npm run rco -- --recipe PlanExecRevEx --task "Build a todo app"
```

**Expected**: Runs 4 agents (Planner → Executor → Reviewer → Explainer), prints output, writes `.cursor/rules/` and MCP JSON.

With dashboard:

```bash
npm run rco -- --dashboard --recipe PlanExecRevEx --task "Build a todo app"
```

Opens WebSocket on port 8080. In another terminal, run `npm run serve-dashboard` and open `http://localhost:8081` to see live metrics.

### Troubleshooting

| Problem | Fix |
|---------|-----|
| Server not showing in MCP settings | Rebuild (`npm run build`), restart Cursor |
| `Cannot find module 'dist/index.js'` | Run `npm run build` |
| Tools not appearing in chat | Check `.cursor/mcp.json` points to `dist/index.js` |
| Recipe not found | Verify the YAML exists in `recipes/` |
| Session expired | Sessions expire after 1 hour — start a new one |
| Fork tests fail | Run `npm run build` before `npm run test:run` |

---

## Daily Driver Smoke Test (Goose + Roland)

End-to-end validation that Roland is ready for everyday use as a Goose coding agent.
Run these tests in order after a fresh setup or upgrade.

### Prerequisites

- Goose installed and configured (`goose session` starts without errors)
- Roland listed in `/tools` (~22 tools under the `roland` extension)
- OpenRouter account with credits (https://openrouter.ai/credits)

---

### Test 1: Verify Tools Connected

```
/tools
```

**Pass:** You see ~22 Roland tools including `health_check`, `triage`, `route_model`,
`preview_changes`, `session_context`, `git_status`, `git_diff`, `git_log`, `git_commit`,
`manage_budget`, `track_cost`, `get_analytics`, `start_recipe`, `advance_recipe`,
`list_recipes`, `suggest_mode`, `run_goose_task`, `project_context`,
`load_migration_context`, `update_migration_context`, `quality_signal`, `analyze_screenshot`.

---

### Test 2: Health Check

```
Use the health_check tool
```

**Pass:** Returns `status: healthy` with `tools_available: 22`.

---

### Test 3: Set Budget

```
Use the manage_budget tool with action "set_limit" and monthly_limit 5.00
```

**Pass:** Returns new limit of $5.00 with enforcement enabled.

Verify:

```
Use the manage_budget tool with action "get_status"
```

**Pass:** Shows $5.00 limit, $0.00 spent, $5.00 remaining.

---

### Test 4: Smart Triage + Model Routing

```
Create a clean TypeScript React component for a user profile card with dark mode support.
```

The agent should automatically call `triage` and/or `route_model`. If it doesn't, test directly:

```
Use the triage tool with query "Create a clean TypeScript React component for a user profile card with dark mode support"
```

**Pass:** Returns recommended agent (e.g., `executor` or `designer`), complexity tier,
suggested model, and optional recipe recommendation.

```
Use the route_model tool with query "Build a React component with dark mode" and budget "moderate"
```

**Pass:** Returns model recommendation with cost estimate and alternatives.

---

### Test 5: Budget Degradation to Free Models

Set budget to near-zero to trigger free model fallback:

```
Use the manage_budget tool with action "set_limit" and monthly_limit 0.01
```

Then route a query:

```
Use the route_model tool with query "Refactor the authentication module"
```

**Pass:** Returns a free model (e.g., `qwen/qwen3-coder:free` or
`nvidia/nemotron-3-super-120b-a12b:free`) instead of a paid model.

Reset budget after:

```
Use the manage_budget tool with action "set_limit" and monthly_limit 5.00
```

---

### Test 6: Full Multi-Agent Recipe

List available recipes:

```
Use the list_recipes tool
```

**Pass:** Returns 9+ recipes.

In a **separate terminal**, run a recipe end-to-end:

```bash
goose run --recipe ~/.roland/roland/goose/recipes/roland-plan-exec-rev-ex.yaml --task "Build a simple CLI todo app in TypeScript with JSON file storage"
```

**Pass:** Recipe completes all steps (Planner → Executor → Reviewer → Explainer)
and produces working TypeScript code.

---

### Test 7: Session Persistence

Start a **fresh** Goose session in the same folder:

```
Continue working on the todo app we just built. Add a search feature and update the tests.
```

**Pass:** Agent finds the existing todo app files and builds on them instead of starting
from scratch. Uses `session_context` or `project_context` to recall prior work.

---

### Test 8: Cost Tracking + Analytics

```
Use the get_analytics tool
```

**Pass:** Shows non-zero usage with breakdowns by model and agent.

```
Use the manage_budget tool with action "get_status"
```

**Pass:** Remaining budget reflects the spending recorded during the session.

---

### Test 9: Git Tools

```
Use the git_status tool
```

```
Use the git_log tool with count 5
```

**Pass:** Both return valid git information for the current project directory.

---

### Test 10: Preview Changes

```
Use the preview_changes tool with file_path "test-file.txt" and original_content "hello world" and proposed_content "hello roland"
```

**Pass:** Returns a unified diff showing the change from "world" to "roland".

---

### Quick 5-Minute Check

If you just need fast validation:

1. `goose session`
2. `/tools` → Roland tools listed
3. `Use the health_check tool` → `status: healthy`
4. `Use the manage_budget tool with action "get_status"` → budget info returned
5. `Use the triage tool with query "fix a bug in the login form"` → triage response
6. `Use the git_status tool` → git info returned

All 6 pass = ready for daily use.

---

### Troubleshooting

| Symptom | Fix |
|---------|-----|
| Roland tools not in `/tools` | Check Goose config has Roland extension, restart session |
| `health_check` fails | Rebuild: `cd ~/.roland/roland && npm run build` |
| "Credits exhausted" on every call | Top up at https://openrouter.ai/credits |
| Budget not degrading to free models | Set budget with `manage_budget` `set_limit` first |
| Recipe not found | Check path: `ls ~/.roland/roland/goose/recipes/` |
| Session context empty | Use `session_context` with `action: observe` to record context first |
| Roland in config but not loading | Use full path to node in Goose config cmd field |

---

## Cross-Platform Notes

All tests run on Windows, macOS, and Linux. The CI release workflow (`.github/workflows/release.yml`) builds npm packages and plugin zips across all three platforms. The install scripts cover macOS/Linux (`install.sh`) and Windows (`install.ps1`).
