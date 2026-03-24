# Roland Roadmap

> Last updated: 2026-03-24

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

> Roland + Goose covers the core coding agent workflows with different strengths than Claude Code:
> multi-model routing, cost control, recipe workflows, and CI/headless execution.

### What Roland + Goose Does Better

| Capability | Roland + Goose | Claude Code |
|---|---|---|
| Model selection | Any OpenRouter model, per-step routing | Claude only |
| Cost visibility | Full per-model tracking, hard budget limits | None |
| Multi-provider recipes | Claude plans, Gemini reviews, cheaper models execute | Single provider |
| Structured domain knowledge | `roland-context.json` — typed rules, versioned, appendable | Freeform `CLAUDE.md` |
| Portability | Runs anywhere Goose runs: CI, cron, headless servers | IDE-bound |
| Budget enforcement | Daily/monthly caps, per-query limits | None |

### Closed Gaps

| Gap | Fixed In | How |
|-----|----------|-----|
| Streaming output | v0.1.2 | `spawn` with piped stdout/stderr in `goose-runner.ts` |
| Git-native tools | v0.1.3 | `git_status`, `git_diff`, `git_log`, `git_commit` MCP tools |
| Permission gating | v0.1.3 | Docker sandboxing + `.roland-permissions.json` policy |
| Session continuity | v0.1.3 | Named Goose sessions + `SessionContextManager` |
| Inline diff UI | v0.1.4 | `roland-diff` VS Code extension with Apply/Discard |
| Sub-agent context | v0.1.5 | `ProjectContextManager` persists knowledge to disk across sessions — shared memory not needed |
| Semantic routing | v0.1.5 | Free OpenRouter model classifies complexity semantically, keyword heuristic as fallback |
| Streaming diffs | v0.1.5 | WebSocket bridge (`DiffStreamServer`) pushes diffs to VS Code extension in real-time |

### Future Enhancements

#### Editor awareness
**Priority:** Low | **Status:** Nice-to-have
Goose doesn't know which file is open or where the cursor is. The `roland-diff` VS Code extension could expose `vscode.window.activeTextEditor` context via the WebSocket bridge as an MCP tool. Low priority — solo devs typically specify file context in their prompts, and this mainly benefits pair-programming UX patterns.

---

*This roadmap is updated as we collect beta feedback. Open an issue or discussion to suggest priorities.*
