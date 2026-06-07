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

1. **Define loop phase model** — Extend orchestrator state with `plan | act | verify | critique | retry` and persist phase transitions.
2. **Wire verification gates** — Connect `test-executor` and linter checks as mandatory verify steps in reference templates.
3. **Harden reliability layer** — Close state/supervisor/project-switch bugs before adding new loop surfaces.
4. **Upgrade dashboard** — Loop phase and verification panel on existing run-state API.
5. **Ship reference loops** — `code → test → fix` and `research → synthesize → validate` as runnable, documented templates.

---

*This document captures vision and measurable goals only. Implementation tracking lives on the Command Blackboard and in `docs/evolution/`.*
