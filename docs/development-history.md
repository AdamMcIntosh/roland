# Development History

Internal reference documenting the evolution of Roland Code Orchestrator (RCO) through four post-MVP phases. For the current feature set, see [README](../ReadMe.MD).

---

## MVP — Core Orchestrator

The TypeScript MVP established the foundation: a YAML-driven orchestrator using `child_process.fork` for agent workers, state persistence via JSON files, and three execution modes (`autonomous-loop`, `parallel-swarm`, `linear`). A WebSocket dashboard (`ws`) provided real-time monitoring, and `exportCursor.ts` generated `.cursor/rules` and MCP JSON from sessions. CLI entry via `npm run rco`.

## Phase 1 — Validation and Testing

**Focus**: Stability and Claude readiness.

- Expanded Vitest test suite: unit tests with injected mock workers, integration tests with real forks
- QA scenario runner: `npm run qa` (single) and `npm run qa:all` (10 scenarios with baseline benchmarks)
- Puppeteer-based Claude mock in `agentWorker.ts` (opt-in via `RCO_USE_PUPPETEER=1`)
- Orchestrator profiling (`console.time`), configurable timeouts (60s default) and retries (2 default)
- README expanded with YAML guide, comparison section, benchmark instructions

## Phase 2 — Claude Code Integration and Plugin Development

**Focus**: Native Claude plugin, persistence, Tauri dashboard.

- **Plugin** (`src/plugin.ts`): Slash commands (`/rco-run:recipe`, `/rco-status`, `/rco-export`) with `plugin/manifest.json` and esbuild bundle
- **Claude prompts** (`src/rco/prompts.ts`): Tool-calling prompt format with JSON response parsing
- **Persistence** (`src/persistence.ts`): Notepad skill prompts for Claude + local JSON fallback
- **Schemas** (`src/schemas.ts`): Zod validation for prompts, responses, state, plugin args
- **Dynamic export**: `exportCursor.ts` enhanced with triage hints derived from session outputs
- **VS Code extension stub**: `extensions/vscode/` with session import commands
- **Tauri dashboard**: `src-tauri/` config, `dashboard-ui/index.html` with Chart.js dependency graph, `broadcastGraph` WebSocket payload
- 19 Phase 2 integration tests covering plugin, persistence, schemas, export, dashboard, prompts

## Phase 3 — Feature Expansion and Differentiation

**Focus**: New modes, agents, skills, customization, analytics.

- **Modes**: `adaptive-swarm` (dynamic step count from task complexity), `collab-mode` (WebSocket pause/resume for user feedback)
- **12 new agents**: api-designer, data-engineer, devops-agent, doc-writer, performance-analyst, refactor-specialist, security-auditor, test-strategist, ui-designer, accessibility-auditor, responsive-design, responsive-design-low (44 total)
- **Skills** (`src/skills.ts`): `eco-optimizer` (Haiku for simple, Sonnet for complex), `graph-visualizer` (DOT output for agent handoffs)
- **Customization**: `/rco-new-agent` generates YAML from a prompt description
- **Dashboard enhancements**: Token/step metrics, CSV export (PapaParse), keyboard shortcuts (hotkeys-js), dark mode toggle
- **Benchmarks**: `src/benchmark.ts` with `npm run benchmark`
- 10 Phase 3 tests covering modes, skills, customization, plugin commands, CSV export

## Phase 4 — Beta Release, Iteration, and Launch

**Focus**: Packaging, distribution, feedback infrastructure.

- **Packaging**: `npm run build-npm`, `npm run build-plugin-zip`, `npm run build-tauri`
- **Install scripts**: `install.sh` (macOS/Linux), `install.ps1` (Windows)
- **CI/CD**: `.github/workflows/release.yml` — triggered on `v*` tags, builds npm dist, plugin zip, and Tauri binaries (macOS/Linux/Windows matrix)
- **Community**: Blog post, issue templates (bug report, feature request), GitHub Discussions setup guide, beta testers guide
- **Telemetry** (`src/telemetry.ts`): Opt-in Sentry with consent management, `/rco-consent:yes` plugin command
- **Sync stub** (`src/sync.ts`): Git-based cloud sync planned for v0.2
- **Iteration**: `ROADMAP.md`, `npm run iterate` for version bumps with changelog entries
- E2E tests for install script, telemetry, release builds, beta feedback

## Verification

All phases verified with 11 test files, 90 tests passing. See [plan-verification-report.md](../plan-verification-report.md) for the full audit.
