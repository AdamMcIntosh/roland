# Phase 1 Summary: Validation and Testing (RCO)

**Branch:** `rco-phase-1`  
**Focus:** Stability and Claude readiness

---

## Milestones achieved

- **Tests expanded (Vitest):** Unit tests for orchestrator with **injected mock worker** (no real fork in unit path), integration test for full PlanExecRevEx run with real fork. Coverage added for:
  - **loadConfig:** PlanExecRevEx and agents loading, RCO config, `getPreferredAgentsForTask`; missing recipe throws; invalid/missing RCO section; invalid agent YAML throws.
  - **stateLock:** `acquireLock` / release, `writeStateUnlocked` / `readStateUnlocked`; `readStateUnlocked` returns null for missing file.
  - **tools:** `dependencyMapper` DOT output, `runTool` for known and unknown tools.
  - **orchestrator:** Runs with `runWorker` injected (mock), respects `workerTimeoutMs` and `workerRetries`, persists state and advances steps; integration run with real fork.
- **Manual QA:** Scripts added: `npm run qa` (single scenario, default todo-app), `npm run qa:all` (10 scenarios). Timings compared to hardcoded baseline benchmark mocks; report printed to stdout.
- **Claude mock pivot:** In `agentWorker.ts`, optional **Puppeteer-based Claude simulation**: when `RCO_USE_PUPPETEER=1`, worker loads a local HTML fixture (`src/rco/fixtures/claude-mock-page.html`) via headless browser and reads the mock response. Inline mock remains default. YAMLs already use real model names (e.g. `claude-3-5-sonnet-20241022`).
- **Performance:** Orchestrator: **profiling** via `console.time`/`timeEnd` (when `RCO_VERBOSE` not disabled), **configurable worker timeout** (default 60s) and **retries** (default 2). Verbose logging for worker path and options.
- **Docs:** README updated with RCO usage (CLI, QA, tests, Puppeteer env, profiling), **RCO YAML guide** (agents, recipes, config), **“RCO vs. Alternatives”** section (modularity, eco mode, dependency-mapper, stability), and benchmark report instructions (`npm run qa:all` + `console.time` on real runs).

---

## Bugs fixed

- None reported; existing RCO behavior preserved. Orchestrator now supports optional `runWorker` injection and configurable timeout/retries without breaking default behavior.

---

## Files created/updated

| Area | Files |
|------|--------|
| **Orchestrator** | `src/rco/orchestrator.ts` — profiling, timeout/retries, injectable `runWorker`, `runWorkerWithRetry` |
| **Agent worker** | `src/rco/agentWorker.ts` — async run, optional Puppeteer path, `resolveMockPagePath`, `getResponseViaPuppeteer` |
| **Fixtures** | `src/rco/fixtures/claude-mock-page.html` — mock page for Puppeteer |
| **Assets** | `scripts/copy-assets.js` — copy RCO fixtures to `dist/rco/fixtures` |
| **Tests** | `tests/rco/orchestrator.test.ts` — loadConfig (incl. errors), stateLock, tools, orchestrator unit (mock worker) + integration (real fork) |
| **QA** | `scripts/qa-scenarios.ts` — 10 scenarios, mock worker, baseline benchmark mocks, `--scenario`, `--all` |
| **Config** | `package.json` — scripts: `test:run`, `test:rco`, `qa`, `qa:all`; devDeps: `sinon`, `@types/sinon`, `puppeteer` |
| **Vitest** | `vitest.config.ts` — globals, node env, include, timeouts |
| **Docs** | `ReadMe.MD` — RCO usage, YAML guide, RCO vs Alternatives, benchmark report, dev scripts |

---

## Next steps (Phase 2)

- Plugin packaging: `manifest.json` for Claude plugin, esbuild bundle, slash commands (e.g. `/rco-run`).
- Interface hooks: Refactor orchestrator toward Claude tool-calling prompts; reduce Node workers where possible; keep hybrid.
- Session persistence: In-memory state save/load via Claude notepad (mock in Puppeteer, then real).
- Hybrid sync: Enhance `exportCursor.ts` to generate `.cursor` rules from sessions; add VS Code extension skeleton.
- Monitoring: Tauri app for dashboard; Chart.js for dependency trees.
- Security: Zod schemas for all inputs/outputs (already used in RCO; extend as needed).

---

## How to run

```bash
git checkout rco-phase-1
npm install
npm run build
npm run test:rco
npm run qa -- --scenario todo-app
npm run qa:all
npm run rco -- --recipe PlanExecRevEx --task "Build a todo app"
```

Optional: `RCO_USE_PUPPETEER=1` for Puppeteer-based worker simulation; `RCO_VERBOSE=1` (default on) for orchestrator profiling.
