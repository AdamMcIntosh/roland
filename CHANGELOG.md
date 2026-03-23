# Changelog

All notable changes to Roland are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Responsive-design agent** — cross-device compatibility, mobile-first layouts, breakpoint strategy, fluid typography, flexible grids (standard + low tier)
- **CodeReviewCompliance recipe** — 4-agent workflow: Researcher → Code-Reviewer → Critic → Writer for code review against requirements
- **DesktopApp recipe** — 6-agent workflow for cross-platform desktop apps (Electron, Tauri, .NET MAUI)
- **RCO Phase 4: Beta release** — packaging (npm, plugin zip, Tauri), install scripts (sh + ps1), CI/CD release workflow, telemetry (Sentry opt-in), sync stub, ROADMAP
- **RCO Phase 3: Feature expansion** — adaptive-swarm mode, collab-mode, 12 new agents, eco-optimizer, graph-visualizer, `/rco-new-agent`, dashboard analytics/CSV/dark mode/hotkeys, benchmarks
- **RCO Phase 2: Claude integration** — plugin with slash commands, manifest.json, Claude prompt hooks, session persistence, Zod schemas, Tauri dashboard, VS Code extension stub
- **RCO Phase 1: Validation** — expanded Vitest suite, QA scenarios, Puppeteer mock, timeouts/retries, profiling
- **RCO MVP** — YAML-driven orchestrator with child_process.fork, 5 execution modes, WebSocket dashboard, Cursor export, CLI

### Fixed
- Logger output switched from `console.log` to `console.error` for MCP-compliant stderr output
- Test suite: fixed API mismatches (selectModel → routeByComplexity, reset → clear), 1-based step_number, agent name casing, fork race conditions
- `resolveWorkerPath` improved with multiple dist fallbacks

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

[2.0.0]: https://github.com/AdamMcIntosh/roland/releases/tag/v2.0.0
[1.0.0]: https://github.com/AdamMcIntosh/roland/releases/tag/v1.0.0
[Unreleased]: https://github.com/AdamMcIntosh/roland/compare/v2.0.0...HEAD
