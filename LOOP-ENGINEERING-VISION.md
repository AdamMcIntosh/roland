# Loop Engineering Vision

> **Mission:** `roland-loop-engineering-v1` — Transform Roland into a True Loop Engineering Platform  
> **Last updated:** 2026-06-07

---

## What We Are Building

Roland today is a **multi-agent orchestration platform**: a Lead PM plans tasks, specialist agents execute in waves, and humans intervene when blockers appear. The next evolution is **Loop Engineering** — a system where operators design high-level loops, and the platform autonomously **plans, executes, verifies, critiques, retries, and self-improves** with minimal intervention.

```
Human designs loop ──► Roland runs closed cycles ──► Outcome verified ──► Loop adapts or completes
                              │
                              ├── Plan
                              ├── Act
                              ├── Verify
                              ├── Critique
                              └── Retry (or escalate)
```

Loop Engineering is not a single feature. It is a **platform capability model** spanning primitives, reliability, observability, and design tools — all wired end-to-end so a mission can run multiple full loops without daily operator babysitting.

---

## Key Outcomes

| # | Outcome | Success signal |
|---|---------|----------------|
| 1 | **Production-grade loop engine** | Long-lived, self-healing missions complete multiple Plan → Act → Verify → Critique → Retry cycles without manual restarts |
| 2 | **Reduced human-in-the-loop friction** | State, refresh, supervisor, and goal-adding bugs no longer block daily usage |
| 3 | **Core loop primitives** | Planning, verification, critique, retry, and observation loops are first-class, composable, and documented with working examples |

---

## Four Capability Areas

### 1. Robust Loop Primitives

The foundation: a standardized loop template and built-in verification so every mission closes feedback loops automatically.

| Primitive | Purpose | Current baseline | Target |
|-----------|---------|------------------|--------|
| **Plan → Act → Verify → Critique → Retry** | Canonical loop template | PM waves + worker signals (partial) | Explicit loop phase in orchestrator; phases observable and replayable |
| **Verification agents** | Objective pass/fail gates | `test-executor`, lint via agents | Built-in test executor, linter, E2E runner wired as verification steps |
| **Critique loop** | Post-action quality assessment | Sentinel review tasks (ad hoc) | Automatic self-critique after verify; findings feed retry or escalation |
| **Retry loop** | Recover from transient or fixable failures | Agent retries + circuit breaker | Retry policy tied to verification outcome, not only network errors |
| **Observation loop** | Continuous state awareness | Blackboard + board status | Live loop health, phase timing, and decision log surfaced to operators |

**Design principle:** A loop primitive is not complete until it is **reachable end-to-end** — defined in config, executed by the orchestrator, visible in the dashboard, and exercised by at least one reference loop.

---

### 2. Reliability & Autonomy

Operators should launch a mission and trust it to run. Reliability work removes the manual unblocking, refresh hacks, and state corruption that break autonomy today.

| Area | Problem today | Target state |
|------|---------------|--------------|
| **State persistence** | Refresh, project-switch, and stale run-state cause HTTP/WS mismatch | Single source of truth for active run-state; survives refresh and project context changes |
| **Supervisor** | Spawn, migration, and recovery edge cases | Rock-solid background supervisor: ready detection, auto-restart, clean PID lifecycle |
| **Stale state** | Orphaned artifacts accumulate in `.roland/` | Auto-cleanup of stale state with safe retention policy |
| **Command Board / goals** | Adding goals mid-mission is unreliable | Goal injection works on active missions; board reflects live loop state |

**Design principle:** Autonomy requires **correct persistence first**. No loop engineering feature ships without verified state semantics under supervisor, refresh, and multi-project usage.

---

### 3. Observability & Control

The dashboard must feel like a **professional loop control system**, not a task runner. Operators need situational awareness and precise escalation points.

| Capability | Operator need | Target |
|------------|---------------|--------|
| **Live loop visibility** | See current phase, progress, and last verification result | Real-time loop phase, wave, and verification status in dashboard |
| **Decision log** | Understand why the PM retried, adjusted, or escalated | Structured decision history tied to loop phases |
| **Mobile-first monitoring** | Check mission health from phone / SSH | Responsive or lightweight TUI view optimized for small screens |
| **Human escalation** | Intervene with full context, not raw logs | HITL pause/unblock/inject with loop phase, blocker, and verification context attached |

**Design principle:** Every escalation surface shows **where in the loop** the mission is stuck and **what verification last reported** — not just agent prose.

---

### 4. Loop Design Tools

Humans design loops; Roland executes them. Design tools make loops **composable, versioned, and reusable**.

| Tool | Purpose | Examples |
|------|---------|----------|
| **Loop templates** | Pre-built patterns for common workflows | Code → test → fix; research → synthesize → validate; plan → implement → review |
| **Composition & versioning** | Define, fork, and evolve loops over time | YAML or recipe format with version pins; diff-friendly loop definitions |
| **Memory & blackboard** | Long-running loop context | Smart recall tuned for loop phase; blackboard entries scoped to loop iteration |

**Design principle:** A template is a **working reference loop**, not documentation alone. Each shipped template must run successfully as a `roland team` or orchestrate mission.

---

## Acceptance Criteria (Measurable Goals)

These criteria gate mission completion. Each item must be demonstrable in daily usage, not aspirational prose.

| ID | Criterion | Measurement |
|----|-----------|-------------|
| **AC-1** | Zero major state/refresh/supervisor bugs in daily usage | 14-day dogfood window: no P1 bugs filed for state corruption, refresh mismatch, supervisor false-ready, or project-switch data loss |
| **AC-2** | Complex mission runs multiple full loops with minimal intervention | Reference mission (≥3 loop cycles: plan → act → verify → critique) completes with ≤1 human unblock; no manual restart |
| **AC-3** | Loop Engineering patterns work inside Roland | ≥2 documented reference loops (e.g. code-test-fix, research-synthesize-validate) execute end-to-end via CLI with passing verification |
| **AC-4** | Dashboard is a loop control system | Dashboard shows active loop phase, verification status, and last decision; operator can answer "what phase?" and "did verify pass?" without reading agent logs |
| **AC-5** | Command Board / goal adding is reliable | Mid-mission goal injection updates board and PM plan within one wave; no stale or duplicate mission state |
| **AC-6** | Built-in verification gates | At least test execution and lint verification are wired as automatic loop steps (not optional manual tasks) |
| **AC-7** | Self-critique and improvement cycles | Post-synthesis or post-verify critique produces actionable retry or memory update without operator prompt |

---

## Relationship to Current Architecture

Roland already has building blocks that Loop Engineering extends — it does not replace them.

| Existing capability | Loop Engineering extension |
|---------------------|----------------------------|
| PM team waves (`team-orchestrator.ts`) | Explicit loop phases inside wave orchestration |
| Worker signals (BLOCKER, MESSAGE) | Verification and critique outcomes as structured signals |
| Command Blackboard | Loop-scoped objectives and per-iteration intel |
| HITL queue (`pause`, `inject`, `unblock`) | Escalation with loop phase context |
| Self-improvement retrospective | Automatic critique → memory write-back |
| Web dashboard | Loop control UI (phase, verify, decisions) |
| Team recipes (`recipes/teams/`) | Seed data for loop templates |

See [docs/evolution/README.md](./docs/evolution/README.md) for the current production architecture map.

---

## Non-Goals (This Mission)

- Replacing the Lead PM or Cursor SDK execution model
- Building a hosted multi-tenant SaaS backend
- General-purpose workflow automation outside software engineering loops
- Implementing every possible loop template — ship **two reference loops** first, then expand

---

## Next Steps for Implementation Waves

1. ~~**Define loop phase model**~~ — **Done (Wave 1, task-1).** See implementation notes below.
2. ~~**Wire verification gates**~~ — **Done (Wave 2–3).** TestExecutor + strategies in verify phase.
3. ~~**Implement critique + retry loop**~~ — **Done (Wave 4–5).** CritiqueEngine + RetryPhaseHandler + `runFullLoop()`.
4. **Harden reliability layer** — Close state/supervisor/project-switch bugs before adding new loop surfaces.
5. ~~**Upgrade dashboard**~~ — **Done (Wave 5).** Loop phase timeline + retry intel in Mission Intel panel.
6. **Ship reference loops** — `code → test → fix` and `research → synthesize → validate` as runnable, documented templates.

---

## Implementation Notes (Wave 1 — Core Loop Phase Model)

**Status:** Shipped in `src/loop-engine/` (2026-06-07).

### Module layout

| Path | Role |
|------|------|
| `src/loop-engine/loop-phases.ts` | `Phase` enum + `PhaseConfig` / `LoopTemplate` types |
| `src/loop-engine/loop-engine.ts` | `LoopEngine` (sequential phase runner + hooks) + `LoopEngineCoordinator` (team-orchestrator lifecycle) |
| `src/loop-engine/loop-state.ts` | Persists `.roland/loop-state.json` — survives supervisor restarts |
| `src/loop-engine/loop-templates.ts` | Loads YAML from `recipes/loops/` |
| `src/loop-engine/phase-handlers/` | Base handlers: Plan, Act, Verify, Critique, Retry, Observe |

### Integration points

- **Blackboard** — each phase handler posts decisions/results/artifacts to RCO blackboard.
- **Command Blackboard** — loop template and phase transitions appended to Mission Objectives / Key Decisions.
- **Run state** — `run-state.json` extended with `loopTemplateId`, `loopPhase`, `loopIteration`, `lastVerification` (dashboard-ready).
- **Team orchestrator** — `TeamOrchestratorOptions.loopTemplate` wires `LoopEngineCoordinator` at planning / wave / synthesis boundaries.
- **Mission creation** — `roland team "goal" --loop-template standard-code-loop` or `POST /api/mission { loopTemplate: "..." }`.

### Shipped templates (`recipes/loops/`)

| Template | Phases |
|----------|--------|
| `standard-code-loop` | plan → act → verify → critique → retry → observe |
| `research-loop` | plan → act → verify → critique → observe |
| `minimal-3-phase` | plan → act → verify (E2E test reference) |

### Configuration (`config.yaml`)

```yaml
loop_engine:
  default_template: standard-code-loop
  templates_dir: recipes/loops
```

### Usage

```bash
# CLI — attach loop template to a team mission
roland team "Fix auth regression" --loop-template standard-code-loop --background

# Standalone loop run (tests / programmatic)
import { LoopEngine, LoopTemplates } from './loop-engine/index.js';
```

### Known limitations (Wave 1 — superseded by task-6)

See **Maturity (task-6)** below for current state. Wave 2–5 shipped verification gates, critique/retry orchestration, and dashboard loop visibility.

---

## Implementation Notes (Wave 5 — Retry Phase + Full Loop Orchestration)

**Status:** Shipped in `src/loop-engine/` (2026-06-07).

### New / enhanced modules

| Path | Role |
|------|------|
| `src/loop-engine/phase-handlers/retry-phase.ts` | Smart retry handler — focused scope, exponential backoff, HITL escalation |
| `src/loop-engine/loop-engine.ts` | `runFullLoop()` — multi-iteration orchestration with timeout, resume, structured logging |
| `src/loop-engine/loop-state.ts` | `LoopStateStore.loadOrCreate()` — resume from `.roland/loop-state.json`; `lastRetry` / `retryHistory` |
| `src/loop-engine/loop-config.ts` | `timeout_ms`, `retry.exponential_backoff` config section |
| `dashboard-ui/index.html` | Phase timeline chips, retry snapshot, live progress bar |

### Capabilities shipped

| Capability | Status |
|------------|--------|
| Full loop execution (`runFullLoop()`) | ✅ Plan → Act → Verify → Critique → Retry → next iteration or complete |
| Configurable max iterations / timeout | ✅ Template + `config.yaml` `loop_engine.timeout_ms` |
| State persistence across restarts | ✅ `resumeFromState` + `LoopStateStore.loadOrCreate()` |
| Focused retry on failed checks | ✅ `retry_focused` decision → scoped verification targets on blackboard |
| Exponential backoff (optional) | ✅ Config-driven; disabled by default for dev speed |
| Human escalation after max retries | ✅ Critique + Retry phases → `escalated` status + HITL blackboard entry |
| Dashboard loop visibility | ✅ Iteration, phase timeline, retry count, live progress |
| Escalation threshold fix | ✅ Consecutive verify-failure HITL no longer fires at `retryCount=maxRetries-1` |

---

## Maturity Level (task-6 — Reliability & Observability)

**Overall:** **Beta / production-hardening** — core loop phases, verification, critique, retry, and escalation are wired end-to-end. Observability, checkpoint recovery, and dashboard loop control ship in task-6.

| Area | Maturity | Shipped in task-6 |
|------|----------|-------------------|
| **Loop primitives** | Stable | Plan → Act → Verify → Critique → Retry → Observe; `LoopEngine` + coordinator |
| **Verification gates** | Stable | `TestExecutor` with unit/lint/typecheck strategies; injected runner for E2E |
| **Critique + retry** | Stable | Rule-based critique engine; escalation independent of maxRetries |
| **Observability** | Beta | Structured phase logging, `loop-metrics.json`, `loop-execution-history.json`, blackboard history |
| **Checkpoint / recovery** | Beta | `loop-checkpoint.json` before each phase; supervisor recovery hint on restart |
| **Model degradation** | Beta | Rate-limit detection; Grok ↔ Composer fallback via `loopDegradationPolicy` |
| **Dashboard** | Beta | Loop intel panel, phase timeline chips, live metrics, Resume/Replan actions |
| **Health API** | Beta | `GET /api/loop-health` — diagnostics, metrics, template catalog |
| **Reference templates** | Beta | `code-quality-loop`, `feature-implementation-loop`, `research-synthesis-loop` (+ legacy templates) |

### task-6 module layout

| Path | Role |
|------|------|
| `src/loop-engine/loop-observability.ts` | Phase transition logging, metrics, execution history + blackboard summarization |
| `src/loop-engine/loop-checkpoint.ts` | Pre-phase checkpoints; `tryRecoverLoopState()` for supervisor restart |
| `src/loop-engine/loop-resilience.ts` | Rate-limit detection; model degradation policy |
| `src/loop-engine/loop-health.ts` | Aggregated health report for dashboard `/api/loop-health` |
| `scripts/serve-dashboard.js` | Loop health route + WebSocket push; watches loop state files |
| `recipes/loops/code-quality-loop.yaml` | Lint/unit/typecheck quality loop |
| `recipes/loops/feature-implementation-loop.yaml` | Feature delivery with integration/smoke verify |
| `recipes/loops/research-synthesis-loop.yaml` | Research → synthesize → validate loop |

### Remaining gaps (post task-6)

| Gap | Priority | Notes |
|-----|----------|-------|
| Retry phase auto re-queues PM tasks | P2 | Retry records intent on blackboard; orchestrator does not yet spawn retry wave automatically |
| LLM-backed critique | P3 | Critique is rule-based; model routing logged for future LLM wiring |
| Distributed / multi-node loops | — | Explicit non-goal |
| Visual loop designer | — | Explicit non-goal |
| 14-day dogfood AC-1 window | P1 | Requires operator usage; no code gate |
| Full exponential backoff on verify | P3 | Circuit breaker covers network; verify retry uses critique policy |

### Usage (task-6)

```bash
# Launch with reference template
roland team "Improve test coverage" --loop-template code-quality-loop --background

# Health diagnostics (dashboard or curl)
curl http://127.0.0.1:8081/api/loop-health

# Scoped tests
npm run test:run -- tests/unit/loop-observability.test.ts
npm run test:run -- tests/e2e/loop-critique-retry-escalation.test.ts
```

---

*This document captures vision and measurable goals only. Implementation tracking lives on the Command Blackboard and in `docs/evolution/`.*
