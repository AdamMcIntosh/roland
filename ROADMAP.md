# RCO Roadmap

Post–Phase 4 plan for Roland Code Orchestrator (RCO). v0.1 is beta-ready; v0.2 and beyond are planned in weekly sprints.

## v0.1 (current) — Beta release

- [x] Packaging: npm, plugin zip, Tauri binaries
- [x] Install script (curl), GitHub release workflow
- [x] Blog post and docs, issue templates, GitHub Discussions
- [x] Opt-in telemetry (Sentry), consent via `/rco-consent:yes`
- [x] Beta program guide, sync stub (Git remotes planned)
- [x] `npm run iterate` for version bump and changelog

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
