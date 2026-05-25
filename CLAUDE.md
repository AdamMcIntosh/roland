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
  index.ts              ← MCP server entry + CLI dispatcher (serve | mcp-config | doctor | pm-log | team)
  rco/
    team-cli.ts         ← `roland team "<goal>"` — renders progress, delegates to team-orchestrator
    team-orchestrator.ts← PM control loop: plan → waves → review → synthesis
    pm-prompts.ts       ← All three Lead PM prompts (planning, review, synthesis)
    prompts.ts          ← Worker agent prompt builder
    worker-signals.ts   ← Parses BLOCKER / MESSAGE signals from agent prose
    model-routing.ts    ← toCursorModelId(model, agentName) — routes to Opus/Sonnet/Composer
    blackboard.ts       ← Shared persistent state (.roland/blackboard.json)
    message-bus.ts      ← Point-to-point agent messaging (.roland/messages.json)
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
```

Both smoke tests exit 1 on any failure. Run them after touching `model-routing.ts` or
`worker-signals.ts`.

---

## Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `ROLAND_AGENT_TIMEOUT_MS` | `1500000` (25 min) | Per-agent wall-clock timeout |
| `ROLAND_AGENT_RETRIES` | `2` | Retries before synthetic BLOCKER return |
| `ROLAND_STATE_DIR` | `.roland` | Blackboard + message-bus directory |
| `ROLAND_QUIET` | unset | Suppress wave progress output |

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
| Lane policy | `src/pm/model-policy.ts` |
| Agent personas | `agents/*.yaml` |
| Team recipes | `recipes/teams/*.yaml` |
| Routing smoke test | `scripts/test-routing.mjs` |
| Signal smoke test | `scripts/test-signals.mjs` |
