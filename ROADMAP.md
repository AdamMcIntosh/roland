# RCO Roadmap

# 1. Install Claude Code if you haven't
npm install -g @anthropic-ai/claude-code

# 2. Launch Claude Code in any project
claude

# 3. Inside Claude Code, install OMC
/plugin marketplace add https://github.com/Yeachan-Heo/oh-my-claudecode
/plugin install oh-my-claudecode
/omc-setup

# 4. Enable Team mode (recommended)
# Add to ~/.claude/settings.json:
# { "env": { "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1" } }

# 5. Try it
autopilot: build a REST API for managing tasks

Post–Phase 4 plan for Roland Code Orchestrator (RCO). v0.1 is beta-ready; v0.2 and beyond are planned in weekly sprints.

## v0.1 (current) — Beta release

- [x] Packaging: npm, plugin zip, Tauri binaries
- [x] Install script (curl), GitHub release workflow
- [x] Blog post and docs, issue templates, GitHub Discussions
- [x] Opt-in telemetry (Sentry), consent via `/rco-consent:yes`
- [x] Beta program guide, sync stub (Git remotes planned)
- [x] `npm run iterate` for version bump and changelog

## v0.1.1 — Goose Integration (completed)

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

## v0.2 — Weekly sprints (planned)

### Week 1: Bug fixes and stability
- Triage and fix bugs from beta feedback
- Harden install script on macOS/Linux/Windows
- Improve error messages and logging (verbose where applicable)

### Week 2: Cloud sync (full implementation)
- Implement `pushToRemote` / `pullFromRemote` in `src/sync.ts`
- Use Git remotes for state (YAML push/pull)
- Config: `.rco-sync-state.json` and optional `config.yaml` sync section

### Week 3: Feedback and polish
- Integrate Sentry DSN for project (replace placeholder)
- Document beta feedback → ROADMAP loop
- Address top feature requests from GitHub Issues/Discussions

### Week 4: Release and iterate
- Cut v0.2 release (tag, artifacts, release notes)
- Announce in blog and community channels
- Plan v0.3 based on metrics and feedback

## v1.0 (vision)

- Full cloud sync with optional hosted backend
- Advanced analytics and benchmarking in dashboard
- Community recipe/agent marketplace (contributed YAML)
- Stable API and migration guides

---

*This roadmap is updated as we collect beta feedback. Open an issue or discussion to suggest priorities.*
