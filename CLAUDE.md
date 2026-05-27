# Roland — CLAUDE.md

Roland is a multi-agent AI orchestration platform delivered as an MCP server for Cursor, VS Code,
and Claude Desktop. It ships agent personas, workflow recipes, a standalone CLI orchestrator (RCO),
and a PM-style team execution engine driven by the Cursor SDK.

---

## Quick Commands

```bash
npm run build           # tsc + copy agents/recipes/fixtures to dist/
npm run dev             # watch mode (no copy-assets)
npm start               # start MCP server (stdio JSON-RPC)
npm run rco:dev         # run RCO orchestrator without building (tsx)
npm run rco:team:dev    # PM team mode without building
npm test                # Vitest unit tests
npm run test:run        # Vitest, no watch
node scripts/test-routing.mjs   # smoke-test model routing (8 cases)
node scripts/test-signals.mjs   # smoke-test worker signal parsing (8 cases)
node scripts/test-mcp-tools.mjs # smoke-test MCP server tools (8 cases)
```

**After any change to `src/`:**
```bash
npm run build
```
The build copies `agents/`, `recipes/`, and `rco/fixtures/` into `dist/`. Changes to YAML files
only take effect after `npm run build` (or use `rco:dev` / `rco:team:dev` for iteration).

---

## Architecture

```
src/
  index.ts              ← MCP server entry + CLI dispatcher (serve | mcp-config | doctor | pm-log | team | pause | resume | unblock | inject | replan | abort | bg-status | bg-logs | bg-stop)
  rco/
    team-cli.ts         ← `roland team "<goal>"` — renders progress, delegates to team-orchestrator
    team-orchestrator.ts← PM control loop: plan → waves → review → synthesis; polls HITL queue
    pm-prompts.ts       ← All three Lead PM prompts (planning, review, synthesis)
    prompts.ts          ← Worker agent prompt builder
    worker-signals.ts   ← Parses BLOCKER / MESSAGE signals from agent prose
    model-routing.ts    ← toCursorModelId(model, agentName) — routes to Opus/Sonnet/Composer
    blackboard.ts       ← Shared persistent state (.roland/blackboard.json)
    message-bus.ts      ← Point-to-point agent messaging (.roland/messages.json)
    usage-tracker.ts    ← Per-run token estimation + cost recording (.roland/usage-history.json)
    project-memory.ts   ← Structured 4-section memory (.roland/memory.md) — merge on each run
    hitl.ts             ← Human-in-the-Loop queue (.roland/hitl.json + hitl-state.json)
    supervisor.ts       ← Background / detached mode — PID file, log rotation, auto-restart
    notifier.ts         ← Contextual push notifications (desktop, webhook, stderr)
    types.ts            ← Core interfaces (TeamTask, AgentYaml, …)
  server/
    mcp-server.ts       ← MCP tool definitions + agent/recipe catalogue
  pm/
    model-policy.ts     ← laneForEngineer() → 'pm' | 'reasoning' | 'coding' | 'light'
agents/                 ← 45 YAML persona files (copied to dist/agents/ on build)
recipes/                ← 20 YAML workflow files (copied to dist/recipes/ on build)
config.yaml             ← Model routing tiers, RCO settings, dashboard port
```

---

## PM Team Mode

The primary execution path for complex goals.

```bash
roland team "Add input validation to the registration endpoint"
roland team "..." --stream          # print 360-char output preview per completed task
roland team "..." --state-dir /tmp  # use alternate state directory
```

**How it works:**
1. **Lead PM** (claude-opus-4-7) reads the goal and roster, outputs a JSON task plan
2. Tasks with no `dependsOn` run **in parallel** (one wave)
3. After each wave, PM reviews outputs and decides: `continue` or `adjust`
   - `adjust` can spawn new tasks, send unblock messages, or re-scope pending tasks
4. Continues until no tasks remain, then PM writes the final synthesis

**State files** (written to `.roland/` by default):
- `blackboard.json` — shared key/value store agents read and write
- `messages.json` — point-to-point message queue between agents
- `usage-history.json` — per-run token/cost estimates appended by `usage-tracker.ts` after every run

---

## Model Routing

`src/rco/model-routing.ts` → `toCursorModelId(requestedModel, agentName)`

| Lane | Model | Agent names that map here |
|------|-------|--------------------------|
| PM | `claude-opus-4-7` | `lead-pm`, `Lead-PM` |
| Reasoning | `claude-sonnet-4-6` | architect, review*, critic, plan*, analyst, scientist, research*, design*, explore*, security*, **author** |
| Execution | `composer-2.5` | executor*, build-fixer, test-executor, tdd-guide, designer, writer, doc* |

`*` = substring match. The `REASONING_ROLES` array in `model-routing.ts` drives the heuristic.

**Verify routing after any change:**
```bash
npm run build && node scripts/test-routing.mjs
```

---

## Agent Personas

Each file in `agents/` defines one persona:

```yaml
name: test-author
role_prompt: >
  You are a senior test engineer …
claude_model: claude-sonnet-4-6
temperature: 0.4
tools:
  - search
  - code
```

**Naming convention:** `agents/<name>.yaml`. Variants use `-low` / `-high` suffix.

**Active QA split (no qa-tester):**
- `test-author` (Sonnet) — writes tests, never runs them
- `test-executor` (Composer) — runs tests, never rewrites them

`qa-tester` and `qa-tester-high` are **retired**. Do not recreate them.

**Adding a new agent:**
1. Create `agents/<name>.yaml`
2. Add to `config.yaml` task_routing if needed
3. Add to relevant `src/server/mcp-server.ts` agent definitions array
4. Run `npm run build` — the copy-assets script will pick it up
5. If it routes differently from the heuristic, update `REASONING_ROLES` or the lane regex in `src/pm/model-policy.ts`

---

## Workflow Recipes

`recipes/` holds two kinds:

| Path | Used by |
|------|---------|
| `recipes/*.yaml` | MCP server (`omc_run_team_start`) |
| `recipes/teams/*.yaml` | `roland team` (PM team mode) |

**Team recipes** (`recipes/teams/`) use `test-author` + `test-executor` as the QA pair — never
`qa-tester`. The three canonical team recipes:
- `full-feature-team.yaml` — design → implement → write-tests → run-tests (+ parallel review)
- `bugfix-team.yaml` — reproduce → diagnose → fix → write-regression → run-regression
- `refactor-team.yaml` — map → plan → refactor → review → write-characterization → run-suite

---

## PM Prompts (`src/rco/pm-prompts.ts`)

Three functions; all return template-literal strings (watch for bare backticks — escape as `` \` ``):

| Function | When called | Key constraint |
|----------|-------------|----------------|
| `buildLeadPMPlanningPrompt` | Phase 1 | Contains Task Scoping Rules — do not remove |
| `buildLeadPMReviewPrompt` | After each wave | Short; PM decides continue/adjust |
| `buildLeadPMSynthesisPrompt` | Phase 3 | Requires 🔴/🟡/🟢 tiers + S/M/L backlog + risk register + deployment checklist |

**Task Scoping Rules** (in the planning prompt) enforce:
- Narrow, parallelizable tasks over large sequential ones
- `test-author` cap: ≤ 8–10 files per task; prefer two parallel test-author tasks over one
- `test-executor` always depends on all test-author tasks for a wave

---

## Worker Signals (`src/rco/worker-signals.ts`)

Agents communicate back to the PM via structured text in their output. Two signal types:

**BLOCKER** — triggers PM `adjust` decision:
```
## 🚨 BLOCKER
**Description:** <reason>
```
or inline: `**BLOCKED:** <reason>`, `⚠️ BLOCKED: <reason>`, `BLOCKING ISSUE: <reason>`

**MESSAGE** — routed to named agent via message bus:
```
## 📨 MESSAGE TO <agent-name>
<content>
```

**Dedup:** `parseWorkerSignals()` deduplicates blockers via substring containment (not prefix
equality) — the section parser captures `**Description:** …` prefix; the inline parser captures bare
reason. Do not change dedup to slice-prefix comparison.

**Smoke test:** `node scripts/test-signals.mjs` — must pass 8/8 before merging changes here.

---

## Timeout & Retry (`src/rco/team-orchestrator.ts`)

```typescript
const AGENT_TIMEOUT_MS  = Number(process.env.ROLAND_AGENT_TIMEOUT_MS)  || 25 * 60 * 1000; // 25 min
const AGENT_MAX_RETRIES = Number(process.env.ROLAND_AGENT_RETRIES)      || 2;
const RETRY_BASE_DELAY  = 5_000; // doubles each retry
```

On final failure, `callCursorAgent` returns a synthetic BLOCKER string rather than throwing —
the PM sees it as a normal blocker and can re-scope or retry. Do not let agent failures throw
past this boundary.

**Override for testing:**
```bash
ROLAND_AGENT_TIMEOUT_MS=60000 roland team "..."   # 1-minute timeout
```

---

## TypeScript Conventions

- **ESM only** — `"type": "module"` in package.json; imports must use `.js` extensions even for `.ts` sources
- **No CommonJS** — no `require()`, no `module.exports`
- **Strict mode** — `"strict": true` in tsconfig.json
- **Backticks in template literals** — must be escaped: `` \` `` not `` ` ``
- **Cursor SDK status values** — `RunResultStatus` is `'finished' | 'error' | 'cancelled'`; `'failed'` does not exist

---

## Testing

```bash
npm test                            # Vitest watch
npm run test:run                    # Vitest, single pass
node scripts/test-routing.mjs       # model routing smoke test (8 cases, 8/8 must pass)
node scripts/test-signals.mjs       # signal parser smoke test (8 cases, 8/8 must pass)
node scripts/test-mcp-tools.mjs     # MCP server smoke test  (8 cases, 8/8 must pass)
```

All three smoke tests exit 1 on any failure. Run them after touching `model-routing.ts`,
`worker-signals.ts`, or `mcp-server.ts`.

---

## Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `ROLAND_AGENT_TIMEOUT_MS` | `1500000` (25 min) | Per-agent wall-clock timeout |
| `ROLAND_AGENT_RETRIES` | `2` | Retries before synthetic BLOCKER return |
| `ROLAND_STATE_DIR` | `.roland` | Blackboard + message-bus directory |
| `ROLAND_QUIET` | unset | Suppress wave progress output |
| `ROLAND_SIMPLE_TUI` | unset | Set to `1` for ASCII-only output (mobile SSH / Termius) |

---

## Web Dashboard

Two files serve the browser-based usage dashboard:

| File | Role |
|------|------|
| `scripts/serve-dashboard.js` | HTTP server (port 8081). Serves static files from `dashboard-ui/` and three JSON API endpoints |
| `dashboard-ui/index.html` | Single-page app — polling-only, no WebSocket dependency |

**API endpoints** (all read from `--state-dir`, default `.roland/`):

| Endpoint | Source file | Returns |
|----------|-------------|---------|
| `GET /api/usage` | `usage-history.json` | `RunUsageRecord[]` — full history |
| `GET /api/usage/summary` | `usage-history.json` | Aggregate totals (runs, tokens, cost, lastRunAt) |
| `GET /api/run-state` | `run-state.json` | `RunState \| null` — live job progress |

**Usage tracker** (`src/rco/usage-tracker.ts`):

- Called at the end of every `runTeam()` in `team-orchestrator.ts`
- Estimates tokens as `chars / 4` and cost from per-model rate table (`MODEL_PRICING`)
- Appends one `RunUsageRecord` to `.roland/usage-history.json` (creates the file on first run)
- Rate table lives at the top of `usage-tracker.ts` — update it if you have better pricing data

**Serving the dashboard against a specific project:**

```bash
node scripts/serve-dashboard.js --state-dir /path/to/project/.roland --port 8082
```

**Backfilling from an existing run-state** (for projects that ran before the tracker was added):

```bash
node scripts/backfill-usage.mjs --state-dir /path/to/project/.roland
```

---

## Structured Project Memory

`src/rco/project-memory.ts` manages `.roland/memory.md` as a **four-section structured document**:

| Section | Purpose |
|---------|---------|
| `Architecture Decisions` | Tech stack choices, patterns adopted — don't contradict |
| `Coding Standards` | File layout, naming, testing conventions |
| `Past Mistakes` | Concrete "never do X" bullets with root causes |
| `Preferences` | Explicit user/team preferences |

**How memory flows:**
1. `runTeam()` calls `memory.snapshot()` → injected into Lead PM planning prompt
2. Synthesis prompt asks PM to write a `## Memory Extract` block with the four sections
3. After synthesis, `memory.extractAndAppend(synthesis, goal, runId)` merges new bullets in
4. New bullets are deduplicated (first 50 chars) before writing

**Memory Extract format** (the PM must use this exactly):
```
**Architecture Decisions:**
- bullet

**Coding Standards:**
- bullet

**Past Mistakes:**
- bullet

**Preferences:**
- bullet
```

The parser maps aliases: `Decisions` → Architecture Decisions, `Patterns` → Coding Standards, `Avoid` → Past Mistakes.

**Adding a bullet manually:**
```typescript
memory.addBullet('Past Mistakes', 'Never call req.destroy() before sending HTTP response');
```

---

## Self-Improvement Loop

`src/rco/self-improvement.ts` — post-run retrospective, memory proposal UI, and write-back.

### How it works

After every synthesis, **Phase 4** runs:
1. **Retrospective LLM call** — Lead PM answers 5 structured questions about the run (what went well, root causes of blockers, wrong assumptions, gotchas, new standards)
2. **Parse output** — `parseRetrospectiveOutput()` extracts bullets from `## Retrospective Memory Update` block
3. **Diff against existing memory** — only bullets not already in `.roland/memory.md` are shown
4. **Interactive proposal** (non-TUI mode with TTY) — shows a colour diff, auto-accepts after 15s
5. **Write** — `applyRetroUpdate()` calls `memory.mergeAndWrite()` and logs count added

### Memory sections (5 total)

| Section | Purpose |
|---------|---------|
| `Architecture Decisions` | Tech choices and design patterns — don't contradict |
| `Coding Standards` | Layout, naming, testing conventions |
| `Past Mistakes` | "Never do X" bullets with root cause |
| `Preferences` | User/team preferences |
| `Project Gotchas` | **NEW** — environment quirks, API edge cases, tooling surprises |

### Disabling

```bash
roland team "goal" --no-improve    # skip retrospective entirely
```

Set `noImprove: true` in `TeamOrchestratorOptions` for programmatic use.

### Smart Recall (planning phase)

Instead of dumping the full memory file, `memory.smartSnapshot(goal)` is used:
- Tokenizes the run goal and each bullet
- Scores by keyword overlap + small recency bonus (later position = more recent write)
- Returns top 4 bullets per section, with a note for hidden entries
- Total capped at `MEMORY_PROMPT_MAX_CHARS` (3,000 chars)

---

## Project Knowledge System

`src/rco/project-knowledge.ts` — automatic project documentation discovery and injection.

### Discovery files (scanned at project root, in priority order)

| File | Purpose | Priority |
|------|---------|---------|
| `ROLAND.md` | Project-specific instructions, constraints, preferences | Highest |
| `ARCHITECTURE.md` | High-level design, system patterns, tech decisions | High |
| `TECH-STACK.md` | Frameworks, libraries, versions, gotchas, conventions | High |
| `REQUIREMENTS.md` | Business rules, user stories, acceptance criteria | Medium |
| `SPECS.md` | Alternative requirements/spec file | Medium |
| `DECISIONS.md` | Architecture Decision Records — auto-updated after runs | Low |

### How it works

1. `loadProjectKnowledge(cwd)` scans for the above files at run start
2. Present files are loaded and a proportional character budget allocated (total cap: 12,000 chars)
3. Injection block (`## Project Knowledge`) is prepended to the Lead PM planning prompt — before `## Project Memory`
4. After synthesis, `appendDecisions()` parses the PM's `## Knowledge Update` block and appends new bullets to `DECISIONS.md`

### Character budget allocation

Budget is split proportionally by weight: ROLAND.md (30%), ARCHITECTURE.md (25%), TECH-STACK.md (25%), REQUIREMENTS/SPECS (15% each), DECISIONS.md (10%). Files are truncated cleanly at line boundaries when over budget.

### Prompt order (planning phase)

```
Goal → Project Knowledge → Project Memory → Blackboard → Task Scoping Rules
```

### DECISIONS.md auto-update

The synthesis prompt asks the PM to write a `## Knowledge Update` section:
```
## Knowledge Update
**DECISIONS.md:**
- [Decision and rationale]
```
`appendDecisions()` parses this block, deduplicates (first 60 chars), and appends a dated section to `DECISIONS.md`. The PM only writes to `DECISIONS.md` — `ARCHITECTURE.md`, `TECH-STACK.md`, and `ROLAND.md` are human-curated and never auto-modified.

---

## Background / Supervisor Mode

`src/rco/supervisor.ts` — detached process management.

```bash
roland team "goal" --background   # spawn detached, return immediately
roland bg-status                   # is it still running? (reads .roland/supervisor.pid)
roland bg-logs                     # tail last 50 lines of .roland/logs/bg-<ts>.log
roland bg-logs --lines 100         # tail more lines
roland bg-stop                     # SIGTERM → SIGKILL (3 s grace)
```

**How it works:**
1. `--background` calls `spawnBackground(goal, argv, stateDir)` in `supervisor.ts`
2. A new `node dist/rco/supervisor.js --background-worker "<goal>" [args]` is spawned detached
3. Parent writes `.roland/supervisor.pid` (JSON: `{pid, goal, startedAt, logFile, restarts}`)
4. Parent calls `child.unref()` and exits
5. Supervisor process runs `runTeamCli(['--quiet', '--no-tui', ...])` with auto-restart loop
6. On crash, retries up to 3 times with exponential back-off (30 s × attempt number)
7. On success or final failure, removes the PID file and exits

**Log files:** `.roland/logs/bg-<timestamp>.log` — stdout + stderr of the background run.

---

## Human-in-the-Loop Controls

`src/rco/hitl.ts` — inter-process command queue.

**Sending commands** (from any terminal while a run is active):
```bash
roland pause                          # pause before next wave starts
roland resume                         # resume after pause
roland unblock task-3 "use REST"      # send guidance to a blocked agent
roland inject "prioritise security"   # post a PM directive to the Blackboard
roland replan                         # ask PM to re-evaluate remaining tasks
roland abort                          # stop after current wave completes
```

**State files:**
- `.roland/hitl.json` — append-only command queue (array); CLI writes, orchestrator drains
- `.roland/hitl-state.json` — pause/resume state (`{paused, pausedAt, updatedAt}`)

**Orchestrator side:**
- `HitlQueue` is created in `team-cli.ts` and passed as `hitlQueue` to `runTeam()`
- `processHitl()` closure inside `runTeam()` is called at the **start of each wave**
- On `pause`: blocks in a 2 s poll loop until `resume` or `abort` (max 30 min, then auto-abort)
- On `unblock`: sends a message via the message bus to the named task/agent
- On `inject`: posts a `decision` entry to the Blackboard (PM sees it on next review)
- On `replan`: posts a critical `decision` entry asking PM to re-evaluate
- On `abort`: returns `true` from `processHitl()` → orchestrator breaks out of wave loop
- `hitlQueue.cleanup()` is called at the end of every run (success or error)

---

## Advanced Contextual Notifications

`src/rco/notifier.ts` — five event types with rich context.

| Event | When | Default |
|-------|------|---------|
| `complete` | Run finished | ✅ on (--notify) |
| `error` | Fatal crash | ✅ on (--notify) |
| `blocker` | Agent raised BLOCKER | ✅ on (--notify) |
| `wave-complete` | Wave done, PM reviewing | off (opt-in) |
| `hitl-pause` | Run paused by human | always |

**Notification bodies are contextual:**
- Complete: `"goal" · 7 tasks · 3 waves · 4m 23s` (+ blocker count if > 0)
- Blocker: `"goal" · Wave 2 · Blocked on: Cannot find 'users' table…`
- Error: `"goal"\nError: CURSOR_API_KEY not set`
- HITL pause: `"goal"\nPaused by human operator\nSend 'roland resume' to continue.`

**Wiring in team-cli.ts:**
- `onBlocker: true` is set whenever `--notify` or `--webhook` is active
- `onBlockerDetected` callback fires `notifier.notify({ event: 'blocker', blockerAgent, blockerDescription, waveNumber })`
- All `notify` calls now include `durationMs` for complete events

---

## Common Pitfalls

1. **Editing YAML agent files but not rebuilding** — `dist/agents/` is stale; run `npm run build`
2. **Adding a backtick inside `pm-prompts.ts`** — will cause `TS1005`/`TS1011`; escape it: `` \` ``
3. **Using `'failed'` as a RunResultStatus** — not a valid SDK value; use `'error'`
4. **Recreating `qa-tester.yaml`** — retired intentionally; use `test-author` + `test-executor`
5. **Putting `test-executor` in parallel with `test-author`** — test-executor must depend on all test-author tasks for its wave
6. **Changing signal dedup to slice-prefix comparison** — will break when section-parsed blockers have `**Description:** ` prefix

---

## Key File Locations

| What | Where |
|------|-------|
| CLI entry point | `src/index.ts` |
| PM team execution | `src/rco/team-orchestrator.ts` |
| PM prompts | `src/rco/pm-prompts.ts` |
| Worker prompts | `src/rco/prompts.ts` |
| Model routing | `src/rco/model-routing.ts` |
| Signal parsing | `src/rco/worker-signals.ts` |
| MCP tool definitions | `src/server/mcp-server.ts` |
| TUI renderer (fancy) | `src/dashboard/tui.ts` |
| TUI renderer (simple / SSH) | `src/dashboard/simple-tui.ts` |
| Lane policy | `src/pm/model-policy.ts` |
| Agent personas | `agents/*.yaml` |
| Team recipes | `recipes/teams/*.yaml` |
| Routing smoke test | `scripts/test-routing.mjs` |
| Signal smoke test | `scripts/test-signals.mjs` |
| MCP tools smoke test | `scripts/test-mcp-tools.mjs` |
| Usage tracker | `src/rco/usage-tracker.ts` |
| Web dashboard HTML | `dashboard-ui/index.html` |
| Dashboard HTTP server | `scripts/serve-dashboard.js` |
| Usage demo seeder | `scripts/seed-usage-demo.mjs` |
| Run backfill tool | `scripts/backfill-usage.mjs` |
| Structured project memory | `src/rco/project-memory.ts` |
| Project knowledge system  | `src/rco/project-knowledge.ts` |
| Self-improvement loop     | `src/rco/self-improvement.ts` |
| HITL command queue | `src/rco/hitl.ts` |
| Background supervisor | `src/rco/supervisor.ts` |
| Contextual notifier | `src/rco/notifier.ts` |
