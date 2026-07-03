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

### v1.3 — Legacy external agent integration removed (completed)

- [x] Removed Block external agent integration (session spawner, headless task tool, CLI recipe runner)
- [x] Renamed `config.yaml` agent section to `budget:` for spending limits only
- [x] Updated setup scripts, init, and docs for Cursor + ClosedLoop architecture
- [x] Deleted container sandbox for external agent CLI (`Dockerfile`, `roland-docker.sh`, dispatch hints)

### v0.1.1 — External agent integration (removed in v1.3)

<details>
<summary>Historical — superseded by Pure ClosedLoop</summary>

- [x] MCP extension configuration for external agent CLI (removed)
- [x] Headless session spawner and recipe runner (removed)
- [x] Pre-built external agent recipe YAMLs (removed)

</details>

### v0.1.2 — Coding Agent (completed)

- [x] Headless external agent session spawner (removed in v1.3)
- [x] `src/utils/migration-context.ts` — `roland-context.json` + `MIGRATION.md` context engine
- [x] `load_migration_context` / `update_migration_context` MCP tools
- [x] `preview_changes` MCP tool — unified diff + HTML preview
- [x] `ROLAND_PROJECT_ROOT` env var support

### v0.1.3 — Gap Closure (completed)

- [x] `src/utils/git-tools.ts` — `git_status`, `git_diff`, `git_log`, `git_commit` MCP tools
- [x] `src/utils/screenshot.ts` — `analyze_screenshot` MCP tool with OpenRouter vision models
- [x] `SessionContextManager` — structured cross-step memory

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

> Roland covers the core coding agent workflows with different strengths than Claude Code:
> multi-model routing, cost control, recipe workflows, and ClosedLoop team missions.

### What Roland Does Better

| Capability | Roland | Claude Code |
|---|---|---|
| Model selection | Any OpenRouter model, per-step routing | Claude only |
| Cost visibility | Full per-model tracking, hard budget limits | None |
| Multi-provider recipes | Claude plans, Gemini reviews, cheaper models execute | Single provider |
| Structured domain knowledge | `roland-context.json` — typed rules, versioned, appendable | Freeform project context file |
| Portability | `roland team` CLI — CI, cron, headless servers | IDE-bound |
| Budget enforcement | Daily/monthly caps, per-query limits | None |

### Closed Gaps

| Gap | Fixed In | How |
|-----|----------|-----|
| Git-native tools | v0.1.3 | `git_status`, `git_diff`, `git_log`, `git_commit` MCP tools |
| Session continuity | v0.1.3 | `SessionContextManager` |
| Inline diff UI | v0.1.4 | `roland-diff` VS Code extension with Apply/Discard |
| Sub-agent context | v0.1.5 | `ProjectContextManager` persists knowledge to disk across sessions |
| Semantic routing | v0.1.5 | Free OpenRouter model classifies complexity semantically, keyword heuristic as fallback |
| Streaming diffs | v0.1.5 | WebSocket bridge (`DiffStreamServer`) pushes diffs to VS Code extension in real-time |

### Future Enhancements

#### Editor awareness
**Priority:** Low | **Status:** Nice-to-have
The agent doesn't know which file is open or where the cursor is. The `roland-diff` VS Code extension could expose `vscode.window.activeTextEditor` context via the WebSocket bridge as an MCP tool. Low priority — solo devs typically specify file context in their prompts, and this mainly benefits pair-programming UX patterns.

---

*This roadmap is updated as we collect beta feedback. Open an issue or discussion to suggest priorities.*
