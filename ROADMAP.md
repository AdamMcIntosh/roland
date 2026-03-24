# Roland Roadmap

> Last updated: 2026-03-23

---

## Release Plan

### v0.1 (current) — Beta release

- [x] Packaging: npm
- [x] Install script (curl), GitHub release workflow
- [x] Blog post and docs, issue templates, GitHub Discussions
- [x] Opt-in telemetry (Sentry)
- [x] Beta program guide, sync stub (Git remotes planned)
- [x] `npm run iterate` for version bump and changelog

### v0.1.1 — Goose Integration (completed)

- [x] Goose MCP extension configuration (`goose/config.yaml`, `goose/extension.yaml`)
- [x] `.goosehints` file with dispatch workflow instructions
- [x] `triage` tool returns `openrouter_model`, `persona_instructions`, `temperature`
- [x] `route_model` tool returns `openrouter_model` with valid OpenRouter slugs
- [x] All 44 agent YAMLs updated to current OpenRouter model IDs
- [x] `config.yaml` updated with OpenRouter routing tiers and `goose` section
- [x] Config loader Zod schema for `goose` config section
- [x] Goose recipe generator script (`scripts/generate-goose-recipes.ts`)
- [x] Pre-built Goose recipes: PlanExecRevEx, BugFix, SecurityAudit
- [x] Documentation: README, INSTALLATION.md updated with Goose setup

### v0.1.2 — Coding Agent (completed)

- [x] `src/utils/goose-runner.ts` — headless Goose session spawner with model routing
- [x] `run_goose_task` MCP tool — spawn autonomous Goose coding sessions from any MCP client
- [x] `scripts/run-recipe.ts` — recipe runner using Goose sub-sessions (file/shell access per step)
- [x] `src/utils/migration-context.ts` — `roland-context.json` + `MIGRATION.md` context engine
- [x] `load_migration_context` / `update_migration_context` MCP tools
- [x] `preview_changes` MCP tool — unified diff + HTML preview
- [x] `ROLAND_PROJECT_ROOT` env var support — fixes cwd footgun in Goose sessions
- [x] `.goose/config.yaml` template with Developer extension + smart routing instructions

### v0.1.3 — Gap Closure (completed)

- [x] `src/utils/git-tools.ts` — `git_status`, `git_diff`, `git_log`, `git_commit` MCP tools
- [x] `src/utils/screenshot.ts` — `analyze_screenshot` MCP tool with OpenRouter vision models
- [x] `src/utils/permission-gate.ts` — `.roland-permissions.json` policy + prompt-level enforcement
- [x] Supervised spawn mode in `goose-runner.ts` — auto-approve/deny Goose tool confirmations
- [x] Named Goose sessions (`--session roland-<id>`) — conversation continuity across recipe steps
- [x] `SessionContextManager` wired into `run-recipe.ts` — structured cross-step memory
- [x] Per-step retry logic in `run-recipe.ts` (`--max-retries` CLI flag)
- [x] Streaming output in `goose-runner.ts` — real-time stdout/stderr via `spawn`

### v0.2 — Weekly sprints (planned)

#### Week 1: Bug fixes and stability
- Triage and fix bugs from beta feedback
- Harden install script on macOS/Linux/Windows
- Improve error messages and logging

#### Week 2: Cloud sync (full implementation)
- Implement `pushToRemote` / `pullFromRemote` in `src/sync.ts`
- Use Git remotes for state (YAML push/pull)
- Config: `.rco-sync-state.json` and optional `config.yaml` sync section

#### Week 3: Feedback and polish
- Integrate Sentry DSN for project (replace placeholder)
- Document beta feedback → ROADMAP loop
- Address top feature requests from GitHub Issues/Discussions

#### Week 4: Release and iterate
- Cut v0.2 release (tag, artifacts, release notes)
- Announce in blog and community channels
- Plan v0.3 based on feedback

### v1.0 (vision)

- Full cloud sync with optional hosted backend
- Advanced analytics and benchmarking in dashboard
- Community recipe/agent marketplace (contributed YAML)
- Stable API and migration guides

---

## Gap Tracking vs Claude Code

> Current estimate: Roland + Goose covers ~75% of Claude Code for coding agent use cases.
> For terminal/CI workflows (e.g. VB6 migration): ~90% coverage.

### What Roland + Goose Does Better

| Capability | Roland + Goose | Claude Code |
|---|---|---|
| Model selection | Any OpenRouter model, per-step routing | Claude only |
| Cost visibility | Full per-model tracking, hard budget limits | None |
| Multi-provider recipes | Claude plans, Gemini reviews, cheaper models execute | Single provider |
| Structured domain knowledge | `roland-context.json` — typed rules, versioned, appendable | Freeform `CLAUDE.md` |
| Portability | Runs anywhere Goose runs: CI, cron, headless servers | IDE-bound |
| Budget enforcement | Daily/monthly caps, per-query limits | None |

### Remaining Gaps

#### 1. No streaming output
**Priority:** High | **Effort:** Low (~2h)
Goose's `spawnSync` blocks until the session finishes — no output visible during long runs.
**Fix:** Switch `spawnSync` → `spawn` with stdout piped line-by-line in `src/utils/goose-runner.ts`.

#### 2. No git-native integration
**Priority:** Medium | **Effort:** Medium (~3h)
Roland has no MCP tools that reason about git state (staged files, blame, commit history).
**Fix:** New `git_tools` module — `git_status`, `git_diff`, `git_log`, `git_commit` wrappers.

#### 3. Permission gating is coarser
**Priority:** Medium | **Effort:** Medium (~4h)
`GOOSE_MODE=auto` suppresses all confirmations. No per-tool allow/deny policy.
**Fix:** Roland middleware that intercepts Goose tool calls and applies a configurable policy.

#### 4. Session continuity across invocations
**Priority:** Medium | **Effort:** Low (~1h)
Each `goose run --no-session` starts fresh. Conversation history is lost between sessions.
**Fix:** Named Goose sessions (`goose run --session <name>`) + Roland appending decisions to `roland-context.json` at session end.

#### 5. Sub-agent spawning is process-level
**Priority:** Low | **Effort:** High
`run_goose_task` spawns a new process — no shared in-memory context between sub-sessions.
**Fix:** Long-running Goose session manager or shared state protocol. Disk-based `roland-context.json` is a reasonable substitute for most tasks.

#### 6. Open file / editor awareness
**Priority:** Low for CLI | **Effort:** High (requires extension)
Goose only knows the filesystem — no awareness of which file is open or cursor position.
**Fix:** VS Code extension exposing active editor context as an MCP tool.

#### 7. Inline diff UI (accept/reject in editor)
**Priority:** Low for CLI | **Effort:** High (requires extension)
`preview_changes` generates correct diffs but no IDE widget to surface them as actionable UI.
**Fix:** VS Code or Cursor extension. Not fixable at the CLI/MCP layer.

### Quick Wins (ranked by impact/effort)

| # | Gap | Effort | Impact |
|---|---|---|---|
| 1 | Streaming output (`spawn` instead of `spawnSync`) | Low (~2h) | High |
| 2 | Git-native MCP tools (`git_status`, `git_diff`, `git_commit`) | Medium (~3h) | Medium |
| 3 | Permission gating middleware | Medium (~4h) | Medium |
| 4 | Named session continuity via `--session` | Low (~1h) | Medium |
| 5 | Inline diff UI | High (VS Code extension) | Low for CLI users |

---

*This roadmap is updated as we collect beta feedback. Open an issue or discussion to suggest priorities.*
