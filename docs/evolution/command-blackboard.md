# Command Blackboard Architecture

The Command Blackboard is Roland's **UNSC-style shared battlespace picture** — evolving `memory.md` from a retrospective knowledge base into a live mission control document while keeping the existing JSON blackboard for orchestrator state machines.

## Two-Layer Model

```
┌─────────────────────────────────────────────────────────────┐
│  Roland (Supervisor)                                        │
│  Assess → Plan → Delegate → Monitor → Review → Report       │
└───────────────┬─────────────────────────┬───────────────────┘
                │                         │
                ▼                         ▼
┌───────────────────────────┐   ┌─────────────────────────────┐
│ command-blackboard.md     │   │ blackboard.json             │
│ Human-readable, markdown  │   │ Machine-readable entries    │
│ Operator + agent context  │   │ Orchestrator task state     │
└───────────────────────────┘   └─────────────────────────────┘
                │                         │
                └────────────┬────────────┘
                             ▼
                ┌───────────────────────────┐
                │ memory.md (complementary) │
                │ Cross-run learning        │
                │ Proven Patterns, Gotchas  │
                └───────────────────────────┘
```

### Why two files?

| File | Audience | Update frequency | Content |
|------|----------|------------------|---------|
| `command-blackboard.md` | Humans + Roland prompt injection | Every wave / significant event | Mission picture, decisions, agent logs |
| `blackboard.json` | `team-orchestrator.ts`, MCP board tools | Every task mutation | Typed entries: task, decision, blocker, artifact, result |
| `memory.md` | Planning prompts across runs | Post-synthesis retrospective | Long-term project knowledge |

## Sections

### Mission Objectives

Active mission goal, success criteria, priority (P1–P4), status.

```markdown
## Mission Objectives

- **M-2026-0042** [P2 active]: Add rate limiting to auth endpoints
  - Success: 429 on excess requests, tests pass, no secret leakage
```

### Key Decisions

Dated decisions with rationale — the single source of truth for "why we chose X."

```markdown
## Key Decisions

- 2026-06-04: Use sliding-window counter in Redis — Forge confirmed existing Redis in staging
- 2026-06-04: Rate limit applies to /login and /register only (operator confirmed scope)
```

### Active Tasks

Orchestrator task mirror in prose form for prompt injection.

```markdown
## Active Tasks

- **task-1** [Oracle] done — Map auth middleware chain
- **task-2** [Sparrow] in_progress — Implement RateLimitMiddleware (depends: task-1)
- **task-3** [Vanguard] pending — Regression + load tests (depends: task-2)
```

### Agent Status

Real-time callsign state.

```markdown
## Agent Status

- **Roland**: active — monitoring Wave 2
- **Sparrow**: active task:task-2
- **Vanguard**: idle
- **Oracle**: complete
- **Sentinel**: idle
- **Forge**: idle
- **Specter**: idle
```

States: `idle` | `active` | `blocked` | `complete`

### Open Intel

Unknowns requiring Oracle or operator input.

```markdown
## Open Intel

- Does production use Redis or in-memory cache for sessions? (blocks Forge staging config)
```

### Artifacts

Tangible outputs — branches, PRs, run IDs, key files.

```markdown
## Artifacts

- Branch: `roland/add-rate-limiting-auth`
- PR: https://github.com/org/repo/pull/142 (pending Sentinel)
- Run: `run-8f3a2b` — Wave 1 complete
```

### Agent Logs

Per-callsign append-only mission logs.

```markdown
## Agent Logs

### Oracle
- [2026-06-04T14:02:00Z] Auth chain: `AuthMiddleware` → `JwtValidator` → handler. Rate limit hook point: post-JWT, pre-handler.

### Sparrow
- [2026-06-04T14:18:00Z] Added `RateLimitMiddleware.cs`, registered in `Program.cs` lines 87–92.
```

## Per-Agent Memory

Each callsign maintains its log subsection under **Agent Logs**. Roland merges summaries into **Key Decisions** when they affect the whole mission.

Sub-agents read:
1. Mission Objectives
2. Key Decisions
3. Their own Agent Log history (via prompt injection or `read_context`)

Sub-agents write:
1. Completion summary → Agent Log
2. BLOCKER → Open Intel + blackboard.json blocker entry

## API (`CommandBlackboard` class)

```typescript
import { CommandBlackboard } from './command-blackboard.js';

const board = new CommandBlackboard('.roland');

// Prompt injection
const excerpt = board.smartSnapshot(goal, 3000);

// Mutations
board.appendBullet('Key Decisions', '2026-06-04: Use Redis sliding window');
board.setAgentStatus({ callsign: 'Sparrow', state: 'active', currentTaskId: 'task-2', lastUpdated: Date.now() });
board.appendAgentLog('Oracle', 'Auth chain mapped — see src/middleware/AuthMiddleware.ts');

// Post-synthesis merge
board.extractAndMerge(synthesisText);
```

## Synthesis Extract Format

After mission complete, Roland writes:

```markdown
## Command Blackboard Update

**Mission Objectives:**
- M-2026-0042 complete — rate limiting shipped

**Key Decisions:**
- <new decisions>

**Artifacts:**
- PR #142 merged
```

Completed mission patterns migrate to `memory.md` **Proven Patterns** via the existing self-improvement loop.

## Relationship to Existing PM Board

MCP tools (`spawn_task`, `pm_standup`, `unblock_task`) operate on `blackboard.json`. `team-orchestrator.ts` keeps `command-blackboard.md` synchronized during autonomous team runs:

- **Mission start** — `board-cleanup.ts` archives stale tasks from prior missions
- **Planning / review / synthesis** — `smartSnapshot(goal)` injected into Lead PM prompts
- **Wave events** — agent status, logs, artifacts updated on the markdown board
- **Post-synthesis** — `## Command Blackboard Update` merged into sections

Manual MCP board ops:

- `spawn_task` → append Active Tasks + set Agent Status
- Blocker resolved → move from Open Intel to Key Decisions
- Wave complete → update Agent Logs + Artifacts

CLI: `roland board-status [--concise]` · `roland board-cleanup [--dry-run]`

## Template

On first run, `CommandBlackboard` creates `.roland/command-blackboard.md` from `buildEmptyTemplate()` in `src/rco/command-blackboard.ts`.
