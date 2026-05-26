# Changelog

All notable changes to Roland are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] — 2026-05-26 — PM Team System (Production Release)

First production-stable release of the Cursor-native PM Team System. A Lead PM
(`grok-4.3`) decomposes goals into parallel tasks, dispatches a team of engineers
(`composer-2.5`), reviews wave outputs, and delivers an executive synthesis — all
from `roland team "..."`.

### Added — Core PM Team System (Phases 1–4)

- **Coordination substrate** — keyed, rev-stamped Blackboard (`blackboard.json`)
  and Message Bus (`messages.json`), persisted under `.roland/` with atomic writes.
- **PM control loop** — Phase 1 (plan) → Wave execution → Phase 2 (review/adjust)
  → Phase 3 (synthesis). PM reviews every wave and can continue, adjust, or unblock.
- **Cursor-native model routing** — Lead PM → `grok-4.3`, all engineers →
  `composer-2.5`. Single source of truth in `toCursorModelId()`.
- **Team recipes** — `full-feature-team`, `bugfix-team`, `refactor-team` in
  `recipes/teams/`.
- **`roland team "goal"` CLI** — `--stream`, `--no-tui`, `--quiet`, `--state-dir`,
  `--notify`, `--webhook`, `--clean` flags.
- **`roland "goal"` shortcut** — alias for `roland team`.
- **`--clean` flag** — wipes `blackboard.json` + `messages.json`, preserves
  `memory.md`, before each run. Prevents stale state from poisoning synthesis.
- **Live Terminal Dashboard** — TUI progress display; `roland status` observer.
- **Persistent Project Memory** — `.roland/memory.md` injected into every planning
  prompt, updated after every synthesis. Accumulates decisions, patterns, and
  things to avoid across runs.
- **Completion Notifications** — desktop, webhook (ntfy.sh / Slack / Discord),
  and stderr. Configurable via `--notify`, `--webhook`, `ROLAND_NOTIFY`.
- **Watch Mode** — `roland watch` fires a team run on every git commit or file
  change.
- **GitHub PR Mode** — `roland pr <number>` reviews and optionally fixes a PR via
  the `gh` CLI.
- **PM event timeline** — `.roland/pm-events.log` + `roland pm-log`.
- **"What would you like to do next?" footer** — actionable next steps printed
  after every run.
- **`## Next Steps` synthesis section** — structured 6-item block in every PM
  synthesis output.

### Added — Quality & Reliability Hardening

- **Strict model routing enforcement** — PM-name heuristic checked first;
  Anthropic model IDs (`claude-sonnet-*`, `claude-opus-*`) removed from
  `VALID_CURSOR_MODELS` so they never bypass routing; startup banner confirms
  model assignments.
- **Test-author ESM rules** — verbatim ESM header injected by PM planner into
  every `test-author` task; `vi.isolateModules` added to FORBIDDEN list; NEVER
  INVENT Vitest APIs rule with explicit allowlist.
- **Stateful isolation rule** — PM planner + test-author persona both require
  fresh instances of rate limiters, stores, and servers per `describe`/`beforeEach`.
- **Executor implementation constraints** — `req.destroy()` prohibition and
  mandatory `jti = crypto.randomUUID()` injected into every executor task
  description and added to the project Memory Extract `Avoid` list.
- **Test-sync rule** — PM planner requires that any implementation change also
  updates or removes affected test assertions in the same task or an explicit
  follow-up before `test-executor` runs.

### Fixed

- **`roland doctor` Windows path bug** — `fileURLToPath(import.meta.url)` replaces
  `.pathname`, which returned a leading `/C:/…` slash on Windows.
- **Model routing passthrough bug** — Anthropic model strings no longer in
  `VALID_CURSOR_MODELS`, closing the bypass that allowed `claude-sonnet-4-6` to
  reach the Cursor SDK verbatim.

## [0.1.4] - 2026-03-24

### Added — Inline Diffs & Docker Sandboxing

- **`extension/` — Roland Diff VS Code extension** — inline accept/reject diffs using native `vscode.diff` API; watches `.omc/pending-changes/` for proposed changes, shows side-by-side diff with Apply/Discard buttons, status bar with pending count, bulk apply/discard all
- **`Dockerfile` + `scripts/roland-docker.sh`** — Docker container isolation for process-level permission gating; mounts only the project directory, no host filesystem access outside the mount; one command to run sandboxed Goose sessions
- **`.dockerignore`** — optimized Docker build context (excludes node_modules, src, tests, docs)
- **`preview_changes` writes pending change files** — automatically writes `.omc/pending-changes/<file>-<timestamp>.json` manifests for VS Code extension consumption; opt-out via `write_pending: false`

### Changed

- **Comparison docs updated** — honest strengths/weaknesses breakdown vs Claude Code
- **Blog post rewritten** — reflects full coding agent with Goose integration, not just MCP server
- **Beta testers guide rewritten** — updated testing commands and focus areas for current feature set

## [0.1.3] - 2026-03-23

### Added — Git Tools, Permissions & Session Continuity

- **`src/utils/git-tools.ts`** — `git_status`, `git_diff`, `git_log`, `git_commit` MCP tools for native git awareness
- **`src/utils/screenshot.ts`** — `analyze_screenshot` MCP tool; captures screen or loads image, sends to OpenRouter vision model (default: `google/gemini-2.5-flash`)
- **`src/utils/permission-gate.ts`** — `.roland-permissions.json` policy file; `buildPermissionBlock()` converts policy to prompt instructions
- **Supervised spawn mode** in `goose-runner.ts` — intercepts Goose tool-call confirmation prompts, auto-approves/denies based on permission policy
- **Named Goose sessions** — `sessionName` option in `GooseSessionOptions`; uses `goose run --session <name>` for conversation continuity across recipe steps
- **`SessionContextManager` in recipe runner** — starts session per recipe run, injects structured context into every step prompt, updates after each step
- **Per-step retry logic** in `run-recipe.ts` — `maxRetries` option and `--max-retries` CLI flag; failed steps re-run with error context appended
- **`.roland-permissions.json` scaffolded by `init.ts`** — default permissive policy created in project root on `roland init`

## [0.1.2] - 2026-03-20

### Added — Coding Agent

- **`src/utils/goose-runner.ts`** — headless Goose session spawner; replaced `spawnSync` with streaming `spawn` for real-time stdout/stderr output
- **`run_goose_task` MCP tool** — spawn autonomous Goose coding sessions from any MCP client
- **`scripts/run-recipe.ts`** — recipe runner using Goose sub-sessions (file/shell access per step via Developer extension)
- **`src/utils/migration-context.ts`** — `roland-context.json` + `MIGRATION.md` context engine
- **`load_migration_context` / `update_migration_context` MCP tools** — load and append to structured project context
- **`preview_changes` MCP tool** — unified diff + HTML preview of file changes
- **`ROLAND_PROJECT_ROOT` env var** — fixes cwd footgun in Goose sub-sessions
- **`.goose/config.yaml` template** — scaffolded by `roland init` with Developer extension + smart routing instructions
- **`VB6Migration` recipe** — 5-agent workflow: ContextLoader → Planner → Executor → Reviewer → Explainer with loop/retry

## [2.0.0] - 2026-02-12

### Architecture Overhaul — IDE-Native MCP Server

Complete pivot from standalone CLI agent system to a pure MCP server. Roland no longer makes its own LLM calls — it provides routing, cost tracking, and multi-agent workflow orchestration while the IDE handles all model interactions.

### Added
- **Auto-pilot triage system** — `triage` MCP tool + Cursor `roland-autopilot.mdc` rule
- **Recipe session management** — `start_recipe` / `advance_recipe` tools with variable interpolation
- **10 MCP tools**: health_check, triage, route_model, track_cost, manage_budget, get_analytics, suggest_mode, list_recipes, start_recipe, advance_recipe
- **32 agent personas** exported as IDE-native config files (.cursor/rules, .github/agents)
- **9 recipes**: PlanExecRevEx, BugFix, RESTfulAPI, SecurityAudit, WebAppFullStack, MicroservicesArchitecture, DocumentationRefactor, DesktopApp, CodeReviewCompliance
- **IDE export system** — `export-ide-configs.ts` and `init.ts` for project portability
- **Project renamed** from Samwise to Roland

### Removed
- Standalone workflow engine, internal LLM calls, API key requirements
- AutonomousAgent, LLMClient, execution mode abstractions
- OpenRouter provider integration (IDE handles providers)
- Interactive CLI (Commander-based), HUD, progress tracking

## [1.0.0] - 2026-02-01

### Production Release — Complete Orchestration Framework

Initial production release with 10 phases complete: MCP server, agent system, 5 skills, model routing, CLI, workflow engine, caching, testing (73+ tests), performance optimizations (lazy loading, circuit breaker, resource pooling), and comprehensive documentation.

### Key Features
- 10 specialized agents loaded from YAML
- 5 core skills (refactoring, documentation, testing, security_scan, performance)
- 5 execution modes (eco, autopilot, ultrapilot, swarm, pipeline)
- Smart model routing with cost optimization
- Persistent query caching with TTL
- Commander.js CLI with 5 commands
- 73+ tests passing (unit, integration, E2E)

---

## Release Process

- **Major** (X.0.0): Breaking changes, major features
- **Minor** (1.X.0): New features, backward compatible
- **Patch** (1.0.X): Bug fixes, minor improvements

[1.0.0]: https://github.com/AdamMcIntosh/roland/releases/tag/v1.0.0
[2.0.0]: https://github.com/AdamMcIntosh/roland/releases/tag/v2.0.0
[0.1.4]: https://github.com/AdamMcIntosh/roland/releases/tag/v0.1.4
[0.1.3]: https://github.com/AdamMcIntosh/roland/releases/tag/v0.1.3
[0.1.2]: https://github.com/AdamMcIntosh/roland/releases/tag/v0.1.2
