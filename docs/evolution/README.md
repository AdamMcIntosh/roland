# Roland Evolution — Architecture & Capabilities

Roland operates as a **UNSC Smart AI supervisor**: a Lead PM orchestrates Halo-themed callsign specialists through the Cursor SDK, a live Command Blackboard, and execution-path triage (Direct chat vs full team mission).

Phase 1 (Command Blackboard, SDK orchestration, global CLI) and Phase 2 (CLI polish, blackboard hygiene, Sparrow hardening, execution-path triage, GitHub branch workflow) are **complete and wired into production paths**.

---

## Capabilities at a glance

| Capability | Status | Entry point |
|------------|--------|-------------|
| PM team execution | ✅ Production | `roland team "goal"` |
| Interactive chat CLI | ✅ Production | `roland` / `roland chat` |
| SDK orchestrate mode | ✅ Production | `roland orchestrate "goal"` |
| Command Blackboard | ✅ Wired into `runTeam()` | `.roland/command-blackboard.md` |
| Board cleanup / hygiene | ✅ Auto at mission start | `board-cleanup.ts`, `roland board-cleanup` |
| Execution-path triage | ✅ MCP + rules | `triage` tool, `execution-path.ts` |
| Force-team override | ✅ Production | `--force-team`, `force team`, … |
| Sparrow hardening | ✅ Production | `agents/unsc/sparrow.yaml`, worker prompts |
| UNSC callsign map | ✅ Production | `unsc-agents.ts`, legacy alias routing |
| GitHub PR mode | ✅ Production | `roland pr`, `roland/<slug>` branches |
| HITL controls | ✅ Production | `pause`, `resume`, `inject`, … |
| Background supervisor | ✅ Production | `--background`, `bg-status`, `bg-logs` |
| MCP server (47 tools) | ✅ Production | `roland mcp-config --write` |
| Project memory + smart recall | ✅ Production | `.roland/memory.md` |
| Self-improvement loop | ✅ Production | post-synthesis retrospective |
| Web dashboard | ✅ Production | `npm run serve-dashboard` |

---

## Architecture diagram

```
┌─────────────────────────────────────────────────────────────────┐
│  Operator — Cursor chat · CLI · Dashboard · SSH HITL          │
└────────────┬───────────────────────────────┬────────────────────┘
             │                               │
             ▼                               ▼
┌────────────────────────┐      ┌───────────────────────────────┐
│  MCP server            │      │  CLI (index.ts)               │
│  triage · roland_run_  │      │  team · orchestrate · board-  │
│  team · pm_standup ·   │      │  status · board-cleanup · HITL│
│  board_status · …      │      └───────────────┬───────────────┘
└────────────┬───────────┘                      │
             │                                  │
             └──────────────┬───────────────────┘
                            ▼
              ┌─────────────────────────────┐
              │  team-orchestrator.ts       │
              │  Plan → Waves → Review →    │
              │  Synthesis                  │
              └─────────────┬───────────────┘
                            │
         ┌──────────────────┼──────────────────┐
         ▼                  ▼                  ▼
┌─────────────────┐ ┌───────────────┐ ┌─────────────────┐
│ Lead PM         │ │ Worker agents │ │ Command         │
│ grok-4.3        │ │ Sparrow ·     │ │ Blackboard +    │
│ planning/review │ │ Vanguard ·    │ │ blackboard.json │
│ synthesis       │ │ Oracle · …    │ │ memory.md       │
└─────────────────┘ └───────────────┘ └─────────────────┘
```

---

## Execution modes

| Mode | Best for | Command / tool |
|------|----------|----------------|
| **Direct** | Single-file edits, Q&A, < 30 min | Cursor chat + tools |
| **Team** | Multi-file missions, tests, synthesis | `roland team`, `roland_run_team` |
| **Orchestrate** | SDK supervisor with inline sub-agents | `roland orchestrate` |
| **Manual PM** | You dispatch engineers in separate panes | MCP `spawn_task`, `pm_standup`, recipes |

### Execution-path triage

`src/rco/execution-path.ts` classifies requests as **direct** or **team**:

- Heuristic scoring (scope, file count signals, explicit Sparrow+Vanguard mentions)
- **Force-team triggers** bypass scoring: `--force-team`, `force team`, `full team`, `run as team`, `spawn team`
- Embedded in Roland system prompts (`EXECUTION_PATH_FRAMEWORK`) and MCP `triage` response (`execution_path.*`)

Cursor rules (`.cursor/rules/roland.mdc`, `roland-autopilot.mdc`) require visible path declaration and correct spawn behavior.

---

## Deliverables map

| Artifact | Location |
|----------|----------|
| Orchestrator persona | `agents/roland-orchestrator.yaml` |
| UNSC sub-agent YAML | `agents/unsc/*.yaml` |
| Cursor SDK sub-agent MD | `.cursor/agents/*.md` |
| Orchestrator prompts | `src/rco/orchestrator-prompts.ts` |
| Command Blackboard | `src/rco/command-blackboard.ts` |
| Board cleanup | `src/rco/board-cleanup.ts` |
| Execution-path triage | `src/rco/execution-path.ts` |
| SDK agent loader | `src/rco/unsc-agents.ts` |
| PM team loop | `src/rco/team-orchestrator.ts` |
| Board status report | `src/rco/board-report.ts` |
| Reference orchestration | `scripts/roland-orchestrate.mjs` |
| Global CLI shim | `bin/roland.js` |

---

## Folder structure

```
roland/
├── agents/
│   ├── roland-orchestrator.yaml
│   ├── unsc/                    ← Sparrow, Vanguard, Oracle, Sentinel, Forge, Specter
│   └── *.yaml                   ← Legacy roster (still used by roland team)
├── .cursor/
│   ├── agents/                  ← SDK file-based subagents
│   └── rules/                   ← roland.mdc, roland-autopilot.mdc
├── .roland/                     ← per-project state (created at runtime)
│   ├── command-blackboard.md
│   ├── blackboard.json
│   ├── memory.md
│   └── messages.json
├── src/rco/
│   ├── team-orchestrator.ts
│   ├── command-blackboard.ts
│   ├── board-cleanup.ts
│   ├── execution-path.ts
│   └── orchestrator-prompts.ts
├── recipes/teams/               ← full-feature-team, bugfix-team, refactor-team
└── docs/evolution/              ← this documentation set
```

---

## Command Blackboard (integrated)

The Command Blackboard is **not a future integration** — it is active in every `runTeam()`:

1. **Mission start** — `cleanupBoardsForNewMission()` archives stale tasks from prior runs
2. **Planning / review / synthesis** — `commandBoard.smartSnapshot(goal)` injected into Lead PM prompts
3. **During waves** — agent status, logs, artifacts updated on the markdown board
4. **Post-synthesis** — PM writes `## Command Blackboard Update`; bullets merge into sections

Two-layer model:

| File | Audience | Content |
|------|----------|---------|
| `command-blackboard.md` | Humans + prompt injection | Mission objectives, decisions, agent status, intel, artifacts |
| `blackboard.json` | Orchestrator + MCP board tools | Typed task/blocker/decision entries |

Details: [command-blackboard.md](./command-blackboard.md)

---

## Callsign map (legacy → UNSC)

| Callsign | Role | Legacy agents |
|----------|------|---------------|
| Sparrow | Coder | `executor*` |
| Vanguard | Tester | `test-author`, `test-executor` |
| Oracle | Researcher | `researcher`, `explore`, `architect` |
| Sentinel | Reviewer | `code-reviewer`, `security-reviewer` |
| Forge | DevOps | `build-fixer` |
| Specter | UI/UX | `designer*` |

`legacyAgentToCallsign()` in `unsc-agents.ts` routes worker prompts and board status.

---

## Global CLI

```bash
cd /path/to/roland && npm ci && npm run build && npm link
cd /path/to/myapp
roland doctor
roland board-status --concise
roland team "Test task"
roland orchestrate "SDK supervisor smoke test"
roland board-cleanup --dry-run
```

### Project root detection

| Priority | Signal |
|----------|--------|
| 1 | `ROLAND_PROJECT_ROOT` or `ROLAND_ROOT` |
| 2 | Parent of `ROLAND_STATE_DIR` when it ends in `.roland` |
| 3 | Walk up from `cwd` for `.roland/` or `.git/` |
| 4 | `process.cwd()` |

Install root (agents, recipes, `dist/`) resolves from `bin/roland.js` via npm package name `"roland"`.

| Command | Entry | Purpose |
|---------|-------|---------|
| `roland` | `bin/roland.js` | Full CLI |
| `roland-mcp` | `bin/roland-mcp.js` | Stdio MCP server |

---

## Cursor MCP integration

```bash
roland mcp-config --write    # merge ~/.cursor/mcp.json — restart Cursor
npm run test:mcp             # smoke test core tools
```

Recommended env in MCP config:

- `ROLAND_PROJECT_ROOT` — target project when Cursor cwd ≠ repo
- `ROLAND_QUIET=1` — keep stderr clean for stdio transport
- `CURSOR_API_KEY` — required for `roland_run_team`

Key tools: `roland_hello`, `triage`, `roland_run_team`, `pm_standup`, `board_status`, `start_team_recipe`, `blackboard_read`, `git_status`.

Full tool list: see [README.md](../../README.md#using-roland-in-cursor).

---

## SDK orchestration reference

| Pattern | Doc |
|---------|-----|
| Inline sub-agents via `Agent.create` | [cursor-sdk-orchestration.md](./cursor-sdk-orchestration.md) |
| Runnable script | `scripts/roland-orchestrate.mjs` |
| Sample mission walkthrough | [sample-workflow-rate-limiting.md](./sample-workflow-rate-limiting.md) |
| Sample board output | [sample-board-status-output.md](./sample-board-status-output.md) |
| Stress test scenarios | [workflow-stress-tests.md](./workflow-stress-tests.md) |

---

## GitHub automation

Team and orchestrate modes preserve the web UI branch workflow:

- Mission branches: `roland/<slug>`
- Sub-agents commit to the active mission branch
- Sentinel review gate before merge
- `roland pr <n> [--fix]` for PR review via `gh` CLI

---

## Operational loop (UNSC)

Every turn — in Cursor or CLI synthesis:

1. **Assess** — `triage` for new work; declare Direct vs Team
2. **Plan** — Lead PM decomposes goal; Command Blackboard + memory injected
3. **Delegate** — waves of parallel callsigns
4. **Monitor** — `pm_standup` / `board-status`; blockers first
5. **Review** — Sentinel gates; Vanguard confirms tests
6. **Report** — Mission Complete footer with Next Steps + battlespace status

---

## Related guides

- [Main README](../../README.md) — user-facing quick start and CLI reference
- [Mini PC deployment](../guides/mini-pc-deployment.md) — Tailscale, systemd, headless MCP
- [PM workflow](../guides/pm-workflow.md) — manual PM mode in Cursor
- [CLAUDE.md](../../CLAUDE.md) — developer conventions and smoke tests
