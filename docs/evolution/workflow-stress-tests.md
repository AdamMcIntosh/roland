# Workflow Stress Tests — Roland → Callsign Handoffs

Three reference workflows used to validate orchestration quality. Run after changes to `board-report.ts`, `prompts.ts`, `orchestrator-prompts.ts`, or `team-orchestrator.ts`.

## How to run

```bash
npm run build

# Quick board snapshot (no API key)
roland board-status --concise --state-dir .roland-test

# Full SDK orchestration (requires CURSOR_API_KEY)
node scripts/roland-orchestrate.mjs "Map auth flow and list test gaps"

# PM team path (requires CURSOR_API_KEY)
roland team "Add GET /health endpoint returning JSON status" --stream --no-improve
```

After each run, verify:

1. `roland board-status --concise` shows blockers first, then roster
2. `.roland/command-blackboard.md` has Agent Status + Agent Logs per callsign
3. Downstream agents cite upstream paths in output (handoff protocol in `prompts.ts`)

---

## Workflow 1 — Intel → Implement (Oracle → Sparrow)

**Goal:** `Document the blackboard API and add a missing export`

| Wave | Callsign | Expect |
|------|----------|--------|
| 1 | Oracle | File map, API surface, gaps — no code |
| 2 | Sparrow | Implements against Oracle's paths — cites upstream |

**Handoff checks:**
- Sparrow opens with assumption bullets (Handoff Protocol)
- Command board: Oracle `complete`, Sparrow `active` → `complete`
- No Vanguard unless tests requested

**Failure modes to watch:**
- Sparrow ignores Oracle intel → refine Oracle prompt to require `## Files Touched`
- Duplicate exploration → Oracle task scoped to read-only

---

## Workflow 2 — Feature + QA (Sparrow → Vanguard author → Vanguard execute)

**Goal:** `Add GET /health with vitest coverage`

| Wave | Callsign | Expect |
|------|----------|--------|
| 1 | Sparrow | Route/handler implementation |
| 2 | test-author | Tests only; lists exact files + `npm run test:run` |
| 3 | test-executor | Runs commands verbatim; no rewrite |

**Handoff checks:**
- test-executor depends on all test-author tasks (never parallel)
- test-author output includes `## Test Files` section with paths
- Board shows `[done]` Active Tasks entries per task id

**Failure modes:**
- test-executor rewrites tests → BLOCKER or PM adjust
- Missing `mkdir -p` / ESM `.js` extension → Past Mistakes in memory

---

## Workflow 3 — Review gate (Sparrow → Sentinel)

**Goal:** `Refactor board-report.ts for concise summary without behavior change`

| Wave | Callsign | Expect |
|------|----------|--------|
| 1 | Sparrow | Minimal diff refactor |
| 2 | Sentinel | Security/correctness review; no implementation |

**Handoff checks:**
- Sentinel references Sparrow's changed files by path
- Open Intel cleared or escalated if Sentinel finds issues
- Roland appends UNSC summary at end (`formatConciseUnscSummary`)

---

## Refinements applied (2026-06)

| Area | Change |
|------|--------|
| **End-of-run reporting** | `team-orchestrator.ts` prints concise UNSC summary automatically |
| **MCP** | `board_status` tool + `pm_standup` appends UNSC block |
| **Worker prompts** | Handoff Protocol when `stepInput` present |
| **Orchestrator prompts** | Delegation Handoff Checklist table |
| **Dashboard** | `/api/board-status` + Command Board panel |
| **CLI** | `roland board-status --concise` |

## Success criteria

- [ ] Zero silent handoffs (every downstream agent restates assumptions or BLOCKERs)
- [ ] Command blackboard Agent Status matches last wave reality
- [ ] `board_status()` markdown fits in one chat screen (~18 lines)
- [ ] Dashboard Command Board updates within 5 s of run completion
- [ ] Mini PC runs stable with `ROLAND_MAX_CONCURRENT=2`
