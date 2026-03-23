# Plan: Roland + Goose Full Coding Agent with Smart Model Routing

**Created**: 2026-03-23
**Complexity**: MEDIUM
**Scope**: 4 files (1 new, 3 modified) + config template update

---

## Context

Roland's recipe runner (`scripts/run-recipe.ts`) currently calls OpenRouter directly via HTTP fetch, producing text-only output. Each recipe step gets an LLM response but cannot read files, edit code, or run shell commands. Goose is an AI agent CLI with a built-in Developer extension (`shell` + `text_editor` tools) that provides exactly these capabilities. By replacing the direct OpenRouter call with a Goose subprocess invocation, each recipe step becomes an autonomous coding agent session that can actually modify the project.

Goose supports OpenRouter as a provider, so Roland's existing model routing (`route_model`, `normaliseModelId`) maps directly to `GOOSE_PROVIDER=openrouter` + `GOOSE_MODEL=<id>` environment variables.

## Work Objectives

- Every recipe step spawns a headless Goose session instead of calling OpenRouter directly
- Smart model routing is preserved: each step uses the model specified in the recipe YAML
- Roland MCP tools (load_migration_context, route_model, track_cost, update_migration_context) remain available within each Goose session via the Roland extension in `.goose/config.yaml`
- A new `run_goose_task` MCP tool allows programmatic Goose invocations from any MCP client
- The `--dry-run` flag continues to work (prints prompt, skips Goose)

## Guardrails

**Must Have:**
- Goose availability check with clear error message before any spawn attempt
- `OPENROUTER_API_KEY` passthrough (Goose needs it when provider=openrouter)
- Timeout control per Goose session (default 300s)
- stdout capture from Goose process as step output
- `--dry-run` preserved in run-recipe.ts

**Must NOT Have:**
- No interactive Goose sessions (always `--no-session`)
- No removal of existing MCP tools or recipe YAML schema
- No changes to recipe YAML format (subagents, workflow, steps remain identical)
- No new npm dependencies (child_process is built-in)

---

## Task Flow

```
Step 1: src/utils/goose-runner.ts (NEW)
   |
   v
Step 2: scripts/run-recipe.ts (MODIFY) -- depends on Step 1
   |
   v
Step 3: src/server/mcp-server.ts (MODIFY) -- depends on Step 1
   |
   v
Step 4: scripts/init.ts (MODIFY) -- independent, can parallel with 2-3
```

---

## Detailed TODOs

### Step 1: Create `src/utils/goose-runner.ts`

New shared utility consumed by both the recipe runner and the MCP tool.

**Functions to implement:**

```
isGooseAvailable(): boolean
```
- Runs `goose --version` via `execSync` in a try/catch
- Returns `true` if exit code 0, `false` otherwise

```
normaliseGooseProvider(model: string): { provider: string; model: string }
```
- If model contains `/` (e.g. `anthropic/claude-sonnet-4-5`), split on first `/`: provider = left side mapped to Goose provider name, model = full string
- Provider mapping: `anthropic` -> `anthropic`, `openai` -> `openai`, `google` -> `google`, everything else -> `openrouter`
- If model has no `/`, always use `openrouter` as provider and run through existing `normaliseModelId()` logic (import `MODEL_PREFIX_MAP` or inline the same table)
- Return `{ provider, model }` where model is the OpenRouter-format ID

```
spawnGooseSession(opts: {
  task: string;
  model: string;
  projectRoot: string;
  env?: Record<string, string>;
  timeoutMs?: number;
  maxTurns?: number;
}): Promise<{ stdout: string; exitCode: number }>
```
- Calls `normaliseGooseProvider(model)` to get provider + model strings
- Spawns `goose run --no-session -t "<task>"` via `child_process.execSync` or `child_process.spawn` (prefer spawn for streaming + timeout control)
- Sets environment variables on the child process:
  - `GOOSE_PROVIDER` = resolved provider
  - `GOOSE_MODEL` = resolved model ID
  - `GOOSE_MODE` = `auto`
  - `GOOSE_MAX_TURNS` = `opts.maxTurns ?? 30`
  - `OPENROUTER_API_KEY` = passthrough from `process.env`
  - Plus any extra `opts.env` entries
- `cwd` = `opts.projectRoot`
- Applies timeout via `setTimeout` + `process.kill()` on the child, default 300000ms
- Captures stdout into a buffer, returns it along with exit code
- On timeout, kills child and throws descriptive error

**Acceptance criteria:**
- [ ] `isGooseAvailable()` returns false when goose is not installed (no throw)
- [ ] `normaliseGooseProvider("claude-sonnet-4-5")` returns `{ provider: "openrouter", model: "anthropic/claude-sonnet-4-5" }`
- [ ] `normaliseGooseProvider("anthropic/claude-sonnet-4-5")` returns `{ provider: "anthropic", model: "anthropic/claude-sonnet-4-5" }`
- [ ] `spawnGooseSession` sets correct env vars and captures output
- [ ] Timeout kills child process and surfaces a clear error message

---

### Step 2: Modify `scripts/run-recipe.ts` to use Goose

Replace `callOpenRouter()` with Goose-based execution.

**Changes:**

1. **Add imports** at top:
   - `import { isGooseAvailable, spawnGooseSession } from '../src/utils/goose-runner.js';`

2. **Add Goose availability check** in `runRecipe()`, right after the `apiKey` check:
   ```
   if (!dryRun && !isGooseAvailable()) {
     throw new Error('Goose CLI is required but not found in PATH. Install: https://github.com/block/goose');
   }
   ```

3. **Replace the live API call block** (lines ~346-354) with:
   - Build a combined task prompt: context block + system prompt + user prompt, formatted as a single task string for Goose
   - Call `spawnGooseSession({ task: combinedPrompt, model, projectRoot, timeoutMs })`
   - Use stdout as `output`
   - Keep duration tracking (`Date.now()` before/after)

4. **Remove `callOpenRouter()` function** (lines 109-160) entirely — no longer needed.

5. **Remove `normaliseModelId()` function** (lines 97-103) — this logic moves to `goose-runner.ts`. Keep `MODEL_PREFIX_MAP` only if goose-runner imports it; otherwise move it too.

6. **Update the console banner** to say "Roland Recipe Runner (Goose)" and note that Goose is the execution backend.

7. **Keep `--dry-run` behavior unchanged** — it already skips the API call block and prints prompts.

**Acceptance criteria:**
- [ ] `npx tsx scripts/run-recipe.ts --recipe PlanExecRevEx --task "test" --dry-run` still prints prompts and exits cleanly
- [ ] With Goose installed, `--recipe PlanExecRevEx --task "..."` spawns Goose for each step
- [ ] Each Goose session receives `GOOSE_PROVIDER=openrouter` and `GOOSE_MODEL=<recipe-model>`
- [ ] Step output captured from Goose stdout is threaded to subsequent steps via `@AgentName` interpolation
- [ ] `callOpenRouter` function is fully removed
- [ ] Error if Goose not in PATH is clear and actionable

---

### Step 3: Add `run_goose_task` MCP tool to `src/server/mcp-server.ts`

Register a new tool that lets any MCP client trigger an autonomous Goose coding session.

**Changes:**

1. **Add import** at top:
   - `import { isGooseAvailable, spawnGooseSession } from '../utils/goose-runner.js';`

2. **Add `this.registerRunGooseTask();`** in `registerTools()` method (line ~119, after `registerUpdateMigrationContext`)

3. **Implement `registerRunGooseTask()`** as a new private method:
   - Tool name: `run_goose_task`
   - Description: `"Run an autonomous Goose coding session with smart model routing. Goose has file read/write and shell access via its Developer extension. Use this to delegate implementation tasks that require actual code changes."`
   - Input schema:
     ```
     task: string (required) — the task description for Goose
     model: string (optional) — model override; if omitted, uses route_model internally
     project_root: string (optional) — defaults to ROLAND_PROJECT_ROOT or cwd
     timeout_seconds: number (optional) — default 300
     max_turns: number (optional) — default 30
     ```
   - Handler logic:
     1. Check `isGooseAvailable()`, throw `McpToolError` if not
     2. If no `model` arg provided, call `ComplexityClassifier.getDetailedAnalysis(task)` and `ModelRouter.routeByComplexity(task)` to pick one
     3. Resolve `projectRoot` from arg -> `ROLAND_PROJECT_ROOT` env -> `process.cwd()`
     4. Call `spawnGooseSession({ task, model, projectRoot, timeoutMs: timeout_seconds * 1000, maxTurns: max_turns })`
     5. Return `{ output: stdout, exit_code, model_used, project_root }`

**Acceptance criteria:**
- [ ] `run_goose_task` appears in `health_check` tool list
- [ ] Calling with `{ task: "echo hello" }` spawns a Goose session and returns stdout
- [ ] Omitting `model` triggers automatic routing via complexity classifier
- [ ] Missing Goose returns a descriptive `McpToolError`, not a crash
- [ ] Timeout is respected and reported

---

### Step 4: Update `scripts/init.ts` — enhance `.goose/config.yaml` template

Update the generated config to include the `developer` extension and expanded Roland instructions.

**Changes:**

1. **Add `developer` extension** to the YAML template (before the `roland` extension):
   ```yaml
   extensions:
     - name: developer
       type: builtin
   ```

2. **Expand Roland extension instructions** to include the full smart-routing workflow. Replace the current instructions block (lines ~141-151) with:
   ```yaml
   instructions: |
     At the start of every session:
     1. Call load_migration_context (init_session: true) to load project rules,
        decisions, and test patterns into your working context.

     Before each significant LLM sub-task:
     2. Call route_model with a summary of the sub-task to get the cheapest
        adequate model recommendation.

     After receiving model responses:
     3. Call track_cost with token counts to maintain accurate spend tracking.

     When you discover new patterns or make architectural decisions:
     4. Call update_migration_context to persist them for future sessions.

     Budget: Always prefer the model recommended by route_model unless the task
     explicitly requires a specific model.
   ```

3. **Add `timeout: 300`** to the Roland extension config block.

**Acceptance criteria:**
- [ ] Running `npx tsx scripts/init.ts /tmp/test-project` on a fresh directory produces a `.goose/config.yaml` with both `developer` and `roland` extensions
- [ ] `developer` extension has `type: builtin`
- [ ] Roland extension instructions include all 4 numbered workflow steps
- [ ] Roland extension has `timeout: 300`
- [ ] Existing projects with `.goose/config.yaml` are not overwritten (skip guard preserved)

---

## Success Criteria

1. A recipe run with Goose installed spawns one Goose session per step, each with Developer extension (shell + text_editor) active
2. Model routing is preserved: each step uses the model from its subagent definition in the recipe YAML
3. The `run_goose_task` MCP tool is callable from VS Code / Cursor and returns Goose session output
4. `--dry-run` continues to work without requiring Goose
5. Clear error messaging when Goose is not installed
6. No changes to recipe YAML schema — all existing recipes work without modification

## Implementation Order

1. `src/utils/goose-runner.ts` (new) -- no dependencies, foundation for everything else
2. `scripts/run-recipe.ts` (modify) -- depends on goose-runner
3. `src/server/mcp-server.ts` (modify) -- depends on goose-runner
4. `scripts/init.ts` (modify) -- independent, can be done in parallel with 2-3

Steps 2 and 3 are independent of each other (both depend only on Step 1).
Step 4 is independent of all others.
