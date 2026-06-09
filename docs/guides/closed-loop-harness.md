# Closed-Loop Harness

Roland's **Closed-Loop Harness** is a production-grade agent iteration system. It runs structured plan → act → verify → critique → reflect cycles until explicit **exit conditions** pass or limits are reached.

The design follows [loops.elorm.xyz](https://loops.elorm.xyz) patterns: self-paced iterations, between-iteration checks, reflection memory, and declarative exit rules.

---

## Quick start

```bash
# Default production harness
roland team "ship OAuth callback handling with tests green" \
  --loop-template closed-loop-harness

# Feature delivery variant
roland team "add user profile settings page" \
  --loop-template feature-implementation-loop

# Code quality / de-sloppify
roland team "clean up slop in recent auth changes" \
  --loop-template code-quality-loop
```

From the dashboard Mission panel, select a loop template when launching a run. Loop health appears in the Loop Engineering panel and `/api/loop-health`.

---

## Lifecycle

Each iteration walks through these phases:

```
PLAN → ACT → VERIFY → CRITIQUE → RETRY? → ESCALATE? → OBSERVE → REFLECT → exit check
```

| Phase | Agent | Purpose |
|-------|-------|---------|
| **plan** | lead-pm | Scope work for this iteration |
| **act** | executor (Sparrow) | Implement changes |
| **verify** | test-executor (Vanguard) | Run **EvaluationGate** checks |
| **critique** | critic | Analyze verify output; decide proceed / retry / escalate |
| **retry** | — | Optional focused retry when critique requests it |
| **escalate** | lead-pm | Optional HITL when retry budget exhausted |
| **observe** | researcher | Record state and metrics |
| **reflect** | researcher / critic | Append learnings to loop memory |

Between iterations, the template's `between_iterations` command runs (e.g. `npm test`). Results are stored in loop memory and feed **exit conditions**.

---

## Loop templates

All templates live in `recipes/loops/`.

| Template | Best for | Max iter | Verification | Exit conditions |
|----------|----------|----------|--------------|-----------------|
| `closed-loop-harness` | Production missions | 10 | lint, unit, typecheck | all_gates_pass + confidence_streak |
| `feature-implementation-loop` | Feature delivery | 8 | unit, integration, smoke | all_gates_pass + command_success |
| `code-quality-loop` | De-sloppify / cleanup | 4 | lint, unit, typecheck | all_gates_pass + command_success |
| `standard-code-loop` | General software loop | 5 | unit, lint, typecheck | max iterations only |
| `research-loop` | Investigation | 3 | critic validation | max iterations |
| `research-synthesis-loop` | Deep research | 3 | critic validation | max iterations |
| `minimal-3-phase` | E2E tests | 1 | unit | single pass |

### When to use which

- **closed-loop-harness** — default for any mission where you want reflection, exit conditions, checkpoint recovery, and clean PR output on completion.
- **feature-implementation-loop** — shipping user-facing features; adds integration and smoke gates.
- **code-quality-loop** — post-feature cleanup; tight iteration budget, lint-first between-iteration checks.
- **standard-code-loop** — simpler missions without reflection or declarative exits.
- **research-loop** / **research-synthesis-loop** — intel gathering, architecture research, no code changes.

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

Example from `closed-loop-harness.yaml`:

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

Templates specify a shell command run after each iteration:

```yaml
between_iterations: npm test
# or
between_iterations: npm run lint && npm test
```

Failures are **non-fatal** — the loop records the result and exit conditions decide whether to continue or stop.

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

---

## Dashboard & observability

```bash
npm run serve-dashboard
# GET /api/loop-health — metrics, checkpoint diagnostics, exit condition status
```

The dashboard Loop Engineering panel shows:

- Active template and current phase
- Gate confidence and streak
- Exit condition evaluation (met / not met)
- Between-iteration run history

---

## Related

- [PR title convention](./pr-title-convention.md)
- [Product vision](../vision.md)
- [Mini PC / Tailscale deployment](./mini-pc-deployment.md)
- Source: `src/loop-engine/closed-loop.ts`, `src/loop-engine/evaluation-gate.ts`, `src/loop-engine/exit-conditions.ts`, `src/loop-engine/loop-memory.ts`
