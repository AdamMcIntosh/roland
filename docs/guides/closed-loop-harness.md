# Closed-Loop Harness

Roland's **Closed-Loop Harness** is a production-grade agent iteration system. It runs structured plan → act → verify → critique → reflect cycles until explicit **exit conditions** pass or limits are reached.

The design follows [loops.elorm.xyz](https://loops.elorm.xyz) patterns: self-paced iterations, between-iteration checks, reflection memory, and declarative exit rules.

---

## Hybrid architecture: Cursor + Roland

| Surface | Role | How to access |
|---------|------|---------------|
| **@roland (Cursor)** | PM, triage, direct edits — self-contained via MCP | Cursor chat + `roland mcp-config` |
| **Roland ClosedLoop** | Loop execution engine — PACVRE harness | `roland team "…" --loop-template …` |
| **Roland Dashboard** | Monitor & control — HITL, pause/resume, history | `npm run serve-dashboard` → http://127.0.0.1:8081 |

> **Hermes** (`roland chat` CLI) is optional for terminal-only workflows — **not required in Cursor**.

**In Cursor**, `@roland` handles triage and PM. **Roland** runs the structured iteration harness when you attach a loop template.

> [DEPRECATED] Legacy in-loop **PM Team** (`use_pm_team: true`) — advanced opt-in only. Prefer **Pure ClosedLoop** (default).

```
  Operator ──► @roland in Cursor (PM + triage) ──► roland team + loop template
                    │
                    ▼
           Roland ClosedLoop (PACVRE execution)
                    │
                    ▼
           Roland Dashboard (monitor + control)
                    │
                    ▼
           Live PACVRE · Verification gates · HITL · History
```

---

## Quick start

Loop-template missions route through **ClosedLoop** (`src/rco/loop-orchestrator.ts`) — not the legacy PM wave engine. The orchestrator detects `--loop-template` and calls `ClosedLoop.run()` for the full lifecycle (verify gates, reflection, exit conditions, PR formatting).

```bash
# Production full-cycle loop (recommended)
roland team "ship OAuth callback handling with tests green" \
  --loop-template full-cycle-verified-loop

# Feature delivery variant
roland team "add user profile settings page" \
  --loop-template feature-implementation-loop

# Refactor / modernize
roland team "clean up slop in recent auth changes" \
  --loop-template refactor-and-modernize-loop
```

From **Cursor** (`@roland`) or the CLI, attach a loop template when launching a run:

```bash
roland team "your goal" --loop-template full-cycle-verified-loop
```

Loop health appears in the dashboard Loop Engineering panel and `/api/loop-health`. The dashboard template catalog is **read-only** — use Hermes to launch, the dashboard to monitor.

---

## Lifecycle

Each iteration walks through these phases:

```
PLAN → ACT → VERIFY → CRITIQUE → RETRY? → ESCALATE? → OBSERVE → REFLECT → exit check
```

| Phase | Agent | Purpose |
|-------|-------|---------|
| **plan** | lightweight planner / Hermes PM scope | Scope work for this iteration (Pure ClosedLoop default) |
| **act** | executor (Sparrow) | Implement changes |
| **verify** | test-executor (Vanguard) | Run **EvaluationGate** checks |
| **critique** | critic | Analyze verify output; decide proceed / retry / escalate |
| **retry** | — | Optional focused retry when critique requests it |
| **escalate** | operator / Hermes | Optional HITL when retry budget exhausted |
| **observe** | researcher | Record state and metrics |
| **reflect** | researcher / critic | Append learnings to loop memory |

> [DEPRECATED] When `use_pm_team: true` is set, Plan/Act may delegate to legacy LeadPM waves instead of lightweight handlers.

Between iterations, the template's `between_iterations` command runs (e.g. `npm test`). Results are stored in loop memory and feed **exit conditions**.

---

## Loop templates

All templates live in `recipes/loops/`. Templates are **generic-first** — project-specific verification commands belong in `config.yaml` under `loop_engine.verification.strategies` and `loop_engine.between_iterations`, not in template YAML.

### Core generic templates

| Template | Best for | Max iter | Verification | PM mode |
|----------|----------|----------|--------------|---------|
| `standard-code-loop` | Default software loop | 5 | unit, lint, typecheck | Pure ClosedLoop (Hermes PM) |
| `feature-implementation-loop` | Feature delivery | 8 | unit, integration, smoke | [DEPRECATED] PM-Enhanced opt-in |
| `refactor-and-modernize-loop` | Refactor / de-sloppify | 4 | lint, unit, typecheck | Pure ClosedLoop (Hermes PM) |
| `research-and-spec-loop` | Research → spec | 3 | critic validation | Pure ClosedLoop (Hermes PM) |
| `mcp-extension-loop` | MCP / server extensions | 6 | unit, smoke, integration | Pure ClosedLoop (Hermes PM) |
| `full-cycle-verified-loop` | Production missions | 10 | lint, unit, typecheck | Pure ClosedLoop (Hermes PM) |
| `research-loop` | Lightweight investigation | 3 | critic validation | Pure ClosedLoop (Hermes PM) |
| `minimal-3-phase` | E2E tests | 1 | unit | Pure ClosedLoop (Hermes PM) |

### Deprecated aliases (backward compatible)

| Deprecated name | Use instead |
|-----------------|-------------|
| `closed-loop-harness` | `full-cycle-verified-loop` |
| `code-quality-loop` | `refactor-and-modernize-loop` |
| `research-synthesis-loop` | `research-and-spec-loop` |

In-flight runs using deprecated names continue to work — YAML entries remain loadable.

### Per-project adaptation (example: Roland)

```yaml
# config.yaml
loop_engine:
  default_template: standard-code-loop
  between_iterations: npm run test:run
  use_pm_team: false   # Pure ClosedLoop default (Hermes PM + Roland Loop Engine)
  verification:
    strategies:
      - type: unit
        command: npm run test:run
      - type: lint
        command: npm run lint
        optional: true
      - type: smoke
        command: node scripts/test-mcp-tools.mjs
        optional: true
```

```bash
# Roland core feature work
roland team "add loop readiness API" --loop-template feature-implementation-loop

# MCP tool work
roland team "add triage tool schema" --loop-template mcp-extension-loop
```

### When to use which

- **full-cycle-verified-loop** — production missions with reflection, exit conditions, checkpoint recovery, PR output.
- **feature-implementation-loop** — user-facing features; [DEPRECATED] set `use_pm_team: true` only if legacy PM waves are required (prefer Hermes + Pure ClosedLoop).
- **refactor-and-modernize-loop** — structural cleanup without behavior change.
- **research-and-spec-loop** — investigation that produces an actionable spec.
- **mcp-extension-loop** — new MCP tools, server handlers, API surfaces.
- **standard-code-loop** — simpler missions without reflection or declarative exits.

---

## EvaluationGate

The verify phase uses **EvaluationGate** instead of ad-hoc test calls. It aggregates:

- **Automated verifiers** — unit, lint, typecheck, integration, smoke (per template)
- **Custom criteria** — injectable pass/fail functions
- **Manual review** — optional gate for HITL approval

Each gate contributes to a **weighted confidence score** (0–1). Verification is **accepted** when all required gates pass and confidence meets `min_confidence` (default 0.85 on production templates).

```typescript
import { EvaluationGate } from './loop-engine/evaluation-gate.js';

const gate = EvaluationGate.forTemplate('closed-loop-harness', {
  cwd: process.cwd(),
  goal: 'Ship feature X',
  iteration: 2,
});
const result = await gate.evaluate();
// result.pass, result.confidence, result.accepted, result.gates[]
```

---

## Exit conditions

Exit conditions are declarative rules in loop YAML. **All configured conditions must pass** (AND semantics) for early exit.

| Type | Meaning |
|------|---------|
| `all_gates_pass` | EvaluationGate accepted with required confidence |
| `confidence_streak` | N consecutive iterations with confidence ≥ threshold |
| `command_success` | Between-iterations command exited 0 |
| `max_iterations` | Implicit — loop ends when budget exhausted |

Example from `full-cycle-verified-loop.yaml`:

```yaml
exit_conditions:
  - type: all_gates_pass
    description: All evaluation gates pass with accepted confidence
  - type: confidence_streak
    description: Success confidence ≥ 0.85 for 2 consecutive iterations
    minConfidence: 0.85
    consecutiveIterations: 2
```

Exit evaluation results are written to loop state and visible on the dashboard Loop Health panel.

---

## Loop memory

Each run gets a stable directory under `.roland/loops/<loop-id>/`:

| File / dir | Contents |
|------------|----------|
| `state.json` | Iteration count, confidence streak, exit status, between-iteration history |
| `reflection.md` | Append-only learnings across iterations |
| `checkpoints/` | Per-iteration snapshots for resume |
| `artifacts/` | Truncated command output tails |

**Reflection phase** appends structured notes after each iteration. On subsequent iterations, the harness can inject recent reflections into agent context.

---

## Between-iterations checks

Configure a project-wide command in `config.yaml`:

```yaml
loop_engine:
  between_iterations: npm run test:run
```

Templates may override with `between_iterations` in YAML, but **prefer config** for portability. Failures are **non-fatal** — the loop records the result and exit conditions decide whether to continue or stop.

Run `npm run loop:ready-check` to validate templates and dispatch before heavy missions.

---

## Checkpoint recovery

The harness writes checkpoints each iteration. On restart with `recoverOnStart` or `resumeFromState`, Roland resumes from the last good checkpoint instead of starting over.

State files:

- `.roland/loop-checkpoint.json` — engine checkpoint
- `.roland/loop-state.json` — live phase + iteration
- `.roland/loops/<loop-id>/state.json` — loop memory disk state

---

## PR formatting on completion

When a closed loop completes successfully, Roland generates a clean conventional PR via `pr-format.ts`:

- Title: `type(scope): imperative description`
- Body: Summary, key changes, testing notes, related metadata

Draft saved to `.roland/loops/<loop-id>/closed-loop-pr.json`.

See [pr-title-convention.md](./pr-title-convention.md) for title/body rules and cleanup commands.

---

## Specialist spawning

**SpecialistSpawner** fires on phase transitions, dispatching focused sub-agents when the harness detects scope gaps (e.g. security review after a failed lint gate). Spawn count is reported in `ClosedLoopResult`.

### YAML-configurable spawns

Define per-phase spawns in `recipes/loops/*.yaml` under `specialist_spawns`. When present, these replace the built-in `PHASE_SPECIALIST_DEFAULTS` for that phase. Templates that omit the section keep backward-compatible defaults.

```yaml
phases:
  - phase: act
    label: Implement
    agent: coding
    specialist_spawns:
      - role: coding
        primary: true
      - role: test-author
        count: 1
        prompt_template: "Outline tests for iteration {iteration} of {goal}"
        conditions:
          after_first_iteration: true
  - phase: verify
    agent: verifier
    specialist_spawns:
      - role: verifier
        primary: true
      - role: test-executor
```

| Field | Purpose |
|-------|---------|
| `role` | Agent persona or generic role (`pm`, `coding`, `researcher`, …) |
| `count` | Spawn intents for this role (default 1) |
| `primary` | Marks the phase primary agent (default: first spawn or `agent`) |
| `prompt_template` | Blackboard reason — tokens: `{goal}`, `{iteration}`, `{phase}`, `{retry}` |
| `conditions` | Optional gates: `iteration_min`, `iteration_max`, `retry_min`, `first_iteration_only`, `after_first_iteration` |

Startup logs include non-default spawns when configured:

```
[Loop]   Specialist spawns (template): act: coding+test-author; verify: verifier+test-executor
```

---

## Verification strategies (YAML + config)

Verify-phase strategies can be declared as a **type filter** (backward compatible) or **full objects** merged with `loop_engine.verification.strategies` in `config.yaml`.

```yaml
# config.yaml — project commands (preferred for hardcoded npm/dotnet/cargo)
loop_engine:
  between_iterations:
    action: run-tests
    optional: true
  verification:
    strategies:
      - type: unit
        command: npm run test:run
      - type: lint
        command: npm run lint
        optional: true
      - type: smoke
        command: node scripts/test-mcp-tools.mjs
        optional: true

# recipes/loops/feature-implementation-loop.yaml
between_iterations:
  action: run-tests
  optional: true
  timeout_ms: 300000
phases:
  - phase: verify
    verification:
      - type: unit
        weight: 0.9
        success_threshold: 1.0
      - type: integration
        optional: true
        weight: 0.8
      - type: smoke
        optional: true
        weight: 0.6
        success_threshold: 0.6
  - phase: observe
    after:
      action: critique-only
```

| Field | Purpose |
|-------|---------|
| `type` | `unit`, `integration`, `smoke`, `e2e`, `lint`, `typecheck` |
| `command` | Shell command — omitted types inherit from config/builtins |
| `optional` | Failure recorded but does not fail the verify gate |
| `weight` | Relative weight in confidence scoring (e.g. unit 0.9, smoke 0.6) |
| `timeout_ms` | Per-strategy timeout |
| `success_threshold` | Confidence contribution when strategy passes (0–1) |
| `min_confidence` | Per-strategy confidence floor when passed |
| `dry_run` | Log strategy without executing |

Resolution order: **template phase objects** → merge by type with **config strategies** → generic builtins.

---

## Between-iterations hooks

Hooks run after each outer iteration (template `between_iterations`) or after a specific phase (`phases[].after` / `phases[].between_iterations`).

| Field | Purpose |
|-------|---------|
| `command` | Shell command to execute |
| `action` | Built-in: `run-tests`, `git-commit`, `critique-only` |
| `message_template` | git-commit: `{goal}`, `{iteration}`, `{phase}`, `{template}` |
| `include_files` | git-commit: stage only these paths |
| `auto_stage` | git-commit: `git add -A` before commit (requires `dry_run: false`) |
| `optional` | Failure recorded but loop continues |
| `dry_run` | Preview only — default **true** for `git-commit` |
| `require_approval` | When `dry_run: false`, pause loop and require operator approval via dashboard (default **false**) |
| `approval_timeout_ms` | Max wait for operator decision (default 30 min) |
| `auto_reject_on_timeout` | Auto-reject commit when timeout elapses (default **true**) |
| `exit_on_failure` | Stop loop when hook exits non-zero |
| `timeout_ms` | Hook timeout (default 120s) |

**git-commit** is safe by default: with `dry_run: true` (default), the hook prints `git status --short` and the proposed message without creating a commit. Set `dry_run: false` and `auto_stage: true` only when you explicitly want real commits.

For production loops with human oversight, enable **HITL approval**:

```yaml
between_iterations:
  action: git-commit
  dry_run: false
  auto_stage: true
  require_approval: true
  approval_timeout_ms: 900000   # 15 min
  auto_reject_on_timeout: true
  optional: true
  message_template: "feat(loop): iteration {iteration} — {goal}"
```

When `require_approval: true` and `dry_run: false`, the loop pauses and writes `.roland/git-commit-approval.json`. Approve, reject, or edit the commit message from:

- **Dashboard** — **Git Commit Approval** panel
- **CLI** — terminal-friendly verbs (same file-backed backend as the API):

```bash
# List pending approval (interactive — shows id, message, preview)
roland approve-commit

# Approve with optional edited message (id optional when one pending)
roland approve-commit [id] --message "feat: ship iteration 2"

# Reject with optional reason
roland reject-commit [id] --reason "needs more tests"

# Non-default state dir (orchestrate / custom runs)
roland approve-commit --state-dir .roland --message "chore: checkpoint"
```

- **HTTP API** (when dashboard server is running):

```bash
curl -X POST http://127.0.0.1:8081/api/git-commit-approval/approve \
  -H 'Content-Type: application/json' \
  -d '{"id":"<approval-id>","message":"feat: ship iteration 2"}'
```

The loop polls `.roland/git-commit-approval.json` and resumes automatically after approve or reject — no separate `roland resume` needed for git-commit HITL.

Dry-run preview (safe default):

```yaml
between_iterations:
  action: git-commit
  dry_run: true
  optional: true
  message_template: "feat(loop): iteration {iteration} — {goal}"
```

Built-in actions expand using config where possible (`run-tests` uses the configured `unit` strategy command).

## Live dashboard during runs

When a loop is active, the **Closed-Loop Harness** panel shows real-time activity via WebSocket/polling:

- Current PACVRE phase and progress
- Active verification strategies (pending → running → pass/fail)
- Running between-iteration hooks (including git-commit dry-run preview)
- Pending git-commit HITL approval (confirm / reject / edit message)
- Dispatch method (Cursor SDK vs direct) and execution mode (Pure ClosedLoop vs [DEPRECATED] PM-Enhanced)
- Specialist spawn activity pulses and rolling history

State flows: `loop-state.json` → `run-state.json` (`liveActivity`) → `/api/loop-health` → dashboard.

Startup banner example:

```
[Loop]   Verification strategies: verify: unit@0.9+integration@0.8?+smoke@0.6≥0.6?
[Loop]   min_confidence: 0.85
[Loop]   Between-iterations hook: git-commit (dry-run, optional, msg-template)
[Loop]   HITL git-commit approval: enabled (dashboard or `roland approve-commit`)
```

---

## Programmatic usage

```typescript
import { ClosedLoop } from './loop-engine/index.js';
import { Blackboard } from './rco/blackboard.js';

const blackboard = new Blackboard({ stateDir: '.roland' });

const loop = new ClosedLoop({
  stateDir: '.roland',
  goal: 'Ship feature X with tests green',
  template: 'feature-implementation-loop',
  blackboard,
  runId: 'run-123',
});

const result = await loop.run();
console.log(result.loopId, result.state.status, result.formattedPr?.title);
```

---

## Configuration knobs

| Field (YAML) | Default | Purpose |
|--------------|---------|---------|
| `maxIterations` | varies | Hard stop after N iterations |
| `maxRetries` | 3 | Retry budget per iteration |
| `escalationThreshold` | 4 | Consecutive verify failures → HITL |
| `min_confidence` | 0.85 | EvaluationGate acceptance threshold |
| `reflection` | false | Enable reflect phase |
| `between_iterations` | — | Post-iteration shell command |
| `timeout_ms` | 1800000 | Per-iteration timeout (harness only) |

Test overrides: set `ROLAND_LOOP_TEST_MODE=1` or pass `isTestMode: true` for relaxed retry/escalation limits.

### End-to-end simulation (safe local dry-run)

Before a production mission, run the bundled simulator — it exercises Pure ClosedLoop, weighted verification, git-commit dry-run, specialist spawn pulses, dashboard `/api/loop-health`, and one HITL approve-commit cycle **without** mutating the repo:

```bash
npm run build
npm run loop:ready-check          # must print READY
npm run loop:e2e-sim              # uses .roland-sim state dir + dashboard :8081

# Options
npx tsx scripts/loop-e2e-sim.ts --no-dashboard
npx tsx scripts/loop-e2e-sim.ts --template full-cycle-verified-loop
```

The simulator:

1. Prints the Loop Engineering startup banner (verification weights, between-iter hook, dispatch mode)
2. Runs `feature-implementation-loop` (Pure ClosedLoop, `enablePmIntegration=false`) with a pass-through verify runner
3. Records YAML specialist spawn pulses to `loop-state.json` → dashboard live panel
4. Runs git-commit **dry-run** hooks between phases (safe default from template YAML)
5. Simulates one **HITL** cycle via `roland approve-commit` against `.roland-sim/git-commit-approval.json`
6. Prints `roland hitl-status --state-dir .roland-sim`

Set `CURSOR_API_KEY` in the environment for true Cursor SDK dispatch; without it the banner shows `Cursor SDK: unavailable — direct fallback active` (expected in CI/local sim).

### Daily Roland usage pattern

```bash
# 1. Preflight
npm run loop:ready-check

# 2. Dashboard (optional but recommended for live PACVRE + HITL panels)
npm run serve-dashboard

# 3. Launch a loop-template mission (Pure ClosedLoop default)
roland team "your goal here" --loop-template full-cycle-verified-loop

# 4. Monitor
roland hitl-status                    # pause/abort queue + git-commit approval
roland board-status --concise

# 5. When git-commit HITL is enabled (dry_run: false, require_approval: true)
roland approve-commit --message "feat: iteration checkpoint"
# or use dashboard Git Commit Approval panel
```

For feature work with YAML specialist spawns and integration/smoke gates, prefer `feature-implementation-loop`. For production missions with reflection and declarative exit conditions, use `full-cycle-verified-loop`.

---

## Dashboard & observability

The dashboard is a **monitor and control surface** — not a chat or mission-planning UI. Use Hermes to launch loops; use the dashboard to watch them run.

```bash
npm run serve-dashboard
# GET /api/loop-health — metrics, checkpoint diagnostics, exit condition status
# GET /api/loop-templates — read-only template catalog (phases, execution modes, spawns)
```

From the dashboard you can:

- Watch live PACVRE phase progress, verification gates, and specialist spawns
- Approve or reject HITL git-commit requests
- Pause, resume, inject directives, and abort active runs
- Browse loop history and the read-only template catalog
- Copy `roland hitl-status` for CLI-side HITL queue inspection

An **Advanced** panel (collapsed by default) provides a fallback mission launcher for phone-only Tailscale access when Hermes is unavailable. Model selection is not exposed — ModelRouter handles routing.

Example `/api/loop-templates` response (truncated):

```json
{
  "defaultTemplate": "standard-code-loop",
  "coreGeneric": ["standard-code-loop", "feature-implementation-loop"],
  "templates": [{
    "name": "feature-implementation-loop",
    "description": "Feature delivery loop — plan scope, implement, verify…",
    "phaseCount": 8,
    "isCoreGeneric": true,
    "executionModes": { "usePmTeam": true, "pmPlan": "auto", "pmAct": "auto" },
    "hasCustomSpawns": true,
    "spawnSummary": "plan: planner; act: coding+test-author; verify: verifier+test-executor"
  }]
}
```

The dashboard Loop Engineering panel shows:

- **Loop template catalog** when idle (from `/api/loop-templates`) — descriptions, phases, spawn summary
- Active template and current phase
- Gate confidence and streak
- Exit condition evaluation (met / not met)
- Between-iteration run history

---

## Related

- [PR title convention](./pr-title-convention.md)
- [Product vision](../vision.md)
- [Mini PC / Tailscale deployment](./mini-pc-deployment.md)
- Source: `src/rco/loop-orchestrator.ts` (routing), `src/loop-engine/closed-loop.ts`, `src/loop-engine/evaluation-gate.ts`, `src/loop-engine/exit-conditions.ts`, `src/loop-engine/loop-memory.ts`
