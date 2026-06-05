# Sample Outputs — board-status & orchestrate

Captured from `.roland-test` after Command Blackboard seed (2026-06-04).

## `roland board-status --concise`

```text
### 🎖 UNSC Mission Status

**Mission:** Integrate payment system with Stripe
**Run:** idle · 41 entries · 0 blockers · 21 done

**Blockers:** _(none)_

**Roster:** Roland ✓ · Sparrow ✓ (task-9) · Vanguard ✓ (task-10) · Oracle ○ · Sentinel ● (task-12) · Forge ✓ (task-14) · Specter ○

**Active tasks (20):**
- [pending] Map existing payment & server surface area → explore-medium
- [pending] Stripe API & integration best-practices brief → researcher
- [pending] Stripe security & compliance checklist → security-reviewer
- [pending] Test strategy for Stripe integration → test-strategist
- [pending] Draft Stripe API contract (OpenAPI) → api-designer

**Open intel:**
- [BLOCKER cleared] UUID schema mismatch fixed in task-20
- Persistent PaymentStore deferred — in-memory store for MVP
```

## `roland board-status` (verbose, truncated)

```text
UNSC Board Status
=================
State dir: .roland-test
Run active: no
Goal: Integrate payment system with Stripe

Counts
  entries: 41
  blockers: 0
  tasks: 21 (0 in progress, 21 done)

Callsign roster
  Roland ✓ · Sparrow ✓ (task-9) · Vanguard ✓ (task-10) · Oracle ○ · Sentinel ● (task-12) · Forge ✓ (task-14) · Specter ○

Active tasks
  - [pending] Map existing payment & server surface area → explore-medium
  …

Blackboard snapshot
-------------------
### TASKS
- [done] **TEAM GOAL**
  Integrate our payment system with Stripe
…
```

## `node scripts/roland-orchestrate.mjs "<goal>"` (expected tail)

Requires `CURSOR_API_KEY`. Representative successful run:

```text
[Roland] Mission: Add GET /health endpoint returning JSON status
[Roland] Sub-agents: sparrow, vanguard, oracle, sentinel, forge, specter
[Roland] run.id=run_abc123 agentId=agent_xyz

… streamed assistant text from Roland + sub-agent delegation …

[Roland] Mission complete.

### 🎖 UNSC Mission Status

**Mission:** Add GET /health endpoint returning JSON status
**Run:** idle · 3 entries · 0 blockers · 2 done

**Blockers:** _(none)_

**Roster:** Roland ✓ · Sparrow ✓ · Vanguard ✓ · Oracle ○ · Sentinel ○ · Forge ○ · Specter ○
```

## MCP equivalents

| CLI | MCP tool |
|-----|----------|
| `roland board-status --concise` | `board_status()` |
| `pm_standup` markdown + UNSC block | `pm_standup()` |

## Dashboard

`GET http://127.0.0.1:8081/api/board-status` returns `{ report, concise, markdown }`.

Overview tab → **🎖 Command Board** panel polls this every 5 s.
